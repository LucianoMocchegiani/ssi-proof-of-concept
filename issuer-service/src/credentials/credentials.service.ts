import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { issuerAgent } from '../agent/agent-store'
import { getIssuerDid } from '../agent/issuer-did-store'
import { getStatusList } from '../agent/issuer-status-list-store'
import { envConfig } from '../config'
import type { CredentialExchangeDto } from './credential-exchange.dto'

/** Resultado de una operación de revocación */
export interface RevokeResult {
  ok: boolean
  credentialId: string
  statusListId: string
  statusListIndex: number
}

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name)

  private get vdrUrl(): string {
    return envConfig.vdrServiceUrl.replace(/\/$/, '')
  }

  /**
   * Pide un índice libre al VDR para la StatusList activa.
   */
  private async allocateStatusIndex(): Promise<{ statusListIndex: number; statusListId: string }> {
    const sl = getStatusList()
    const res = await fetch(`${this.vdrUrl}/status/list/${sl.id}/allocate`, { method: 'POST' })
    if (!res.ok) throw new Error(`Failed to allocate status index: ${res.status}`)
    const data = await res.json() as { statusListIndex: number }
    return { statusListIndex: data.statusListIndex, statusListId: sl.id }
  }

  /**
   * Registra en el VDR el mapeo credentialId → (statusListId, statusListIndex).
   * Credo no soporta credentialStatus en JSON-LD, así que el mapeo es externo.
   */
  private async registerCredentialMapping(credentialId: string, statusListId: string, statusListIndex: number): Promise<void> {
    const res = await fetch(`${this.vdrUrl}/status/credential-map`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId, statusListId, statusListIndex }),
    })
    if (!res.ok) this.logger.warn(`Failed to register credential mapping: ${res.status}`)
  }

  async offerCredential(
    params: CredentialExchangeDto,
  ): Promise<{ credentialExchangeId: string; state: string; credentialId: string; statusListIndex?: number } | { error: string }> {
    const agent = issuerAgent as any
    if (!agent) return { error: 'Agent not ready' }

    const conn = await agent.didcomm?.connections?.findById(params.connectionId)
    if (!conn) return { error: `Connection ${params.connectionId} not found` }

    const issuerDid = getIssuerDid()
    const holderDid = conn.theirDid ?? conn.previousTheirDids?.[0]
    const credentialSubject = {
      ...params.credential.credentialSubject,
      id: params.credential.credentialSubject?.id ?? holderDid,
    }
    const customTypes = params.credential.type ?? ['GenericCredential']

    let statusListIndex: number | undefined
    let statusListId: string | undefined
    try {
      const alloc = await this.allocateStatusIndex()
      statusListIndex = alloc.statusListIndex
      statusListId = alloc.statusListId
    } catch (err) {
      this.logger.warn('Could not allocate status index, credential will be issued without revocation support', err)
    }

    const credentialId = `urn:uuid:${randomUUID()}`

    const credential: Record<string, unknown> = {
      '@context': params.credential['@context'] ?? [
        'https://www.w3.org/2018/credentials/v1',
        'http://schema.org/',
        Object.fromEntries(customTypes.map((t) => [t, `https://www.w3.org/2018/credentials#${t}`])),
      ],
      id: credentialId,
      type: ['VerifiableCredential', ...customTypes],
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      credentialSubject,
    }

    try {
      const exchange = await agent.didcomm.credentials.offerCredential({
        connectionId: params.connectionId,
        protocolVersion: 'v2',
        credentialFormats: {
          jsonld: {
            credential,
            options: {
              proofType: params.proofType ?? 'Ed25519Signature2018',
              proofPurpose: 'assertionMethod',
            },
          },
        },
      })

      if (statusListIndex != null && statusListId) {
        await this.registerCredentialMapping(credentialId, statusListId, statusListIndex)
      }

      return { credentialExchangeId: exchange.id, state: exchange.state, credentialId, statusListIndex }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { error: message }
    }
  }

  /**
   * Revoca una credencial por su credentialId.
   * Consulta el VDR para obtener el statusListId + statusListIndex a partir del mapeo externo.
   */
  async revokeCredential(credentialId: string): Promise<RevokeResult> {
    const mapRes = await fetch(`${this.vdrUrl}/status/credential/${encodeURIComponent(credentialId)}/revoked`)
    if (mapRes.status === 404) throw new Error(`No revocation mapping found for credential ${credentialId}`)
    if (!mapRes.ok) throw new Error(`VDR lookup failed (${mapRes.status})`)

    const mapping = await mapRes.json() as { revoked: boolean; statusListId: string; statusListIndex: number }
    if (mapping.revoked) {
      return { ok: true, credentialId, statusListId: mapping.statusListId, statusListIndex: mapping.statusListIndex }
    }

    const res = await fetch(`${this.vdrUrl}/status/list/${mapping.statusListId}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ statusListIndex: mapping.statusListIndex }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`VDR revoke failed (${res.status}): ${text}`)
    }

    this.logger.log(`Credential revoked: ${credentialId} (list=${mapping.statusListId} index=${mapping.statusListIndex})`)
    return { ok: true, credentialId, statusListId: mapping.statusListId, statusListIndex: mapping.statusListIndex }
  }

}
