import { Injectable, Logger } from '@nestjs/common'
import { JsonTransformer } from '@credo-ts/core'
import { holderAgent } from '../agent/agent-store'
import { getHolderDid } from '../agent/holder-did-store'
import { envConfig } from '../config'
import type { CredentialExchangeDto } from './credential-exchange.dto'

function toCredentialPayload(enc: unknown, json: unknown): unknown {
  if (typeof enc === 'string') return enc
  if (enc && typeof enc === 'object') return JsonTransformer.toJSON(enc)
  return json && typeof json === 'object' ? JsonTransformer.toJSON(json) : enc
}

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name)

  async proposeCredential(
    params: CredentialExchangeDto,
  ): Promise<{ credentialExchangeId: string; state: string } | { error: string }> {
    const agent = holderAgent as any
    if (!agent) return { error: 'Agent not ready' }

    const conn = await agent.didcomm?.connections?.findById(params.connectionId)
    if (!conn) return { error: `Connection ${params.connectionId} not found` }

    const holderDid = getHolderDid()
    const customTypes = params.credential.type ?? ['GenericCredential']
    const credential = {
      '@context': params.credential['@context'] ?? [
        'https://www.w3.org/2018/credentials/v1',
        'http://schema.org/',
        Object.fromEntries(customTypes.map((t) => [t, `https://www.w3.org/2018/credentials#${t}`])),
      ],
      type: ['VerifiableCredential', ...customTypes],
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: params.credential.credentialSubject?.id ?? holderDid,
        ...params.credential.credentialSubject,
      },
    }

    try {
      const exchange = await agent.didcomm.credentials.proposeCredential({
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
        comment: 'Requesting credential',
      })
      return { credentialExchangeId: exchange.id, state: exchange.state }
    } catch (err: any) {
      this.logger.error('proposeCredential failed', err?.message ?? err)
      return { error: err?.message ?? String(err) }
    }
  }

  async listCredentials(): Promise<{ credentials: unknown[] } | { error: string }> {
    const agent = holderAgent as any
    if (!agent) return { error: 'Agent not ready' }
    const w3cApi = agent.w3cCredentials
    if (!w3cApi?.findAllByQuery) return { credentials: [] }
    const creds = await w3cApi.findAllByQuery({})
    return {
      credentials: creds.map((c: any) => toCredentialPayload(c.encoded, c.jsonCredential)),
    }
  }

  /**
   * Consulta si una credencial fue revocada por su ID.
   * Usa el mapeo externo en el VDR (credentialId → statusListId + index).
   */
  async checkCredentialStatus(credentialId: string): Promise<{ revoked: boolean; error?: string }> {
    try {
      const vdrUrl = envConfig.vdrServiceUrl.replace(/\/$/, '')
      const res = await fetch(`${vdrUrl}/status/credential/${encodeURIComponent(credentialId)}/revoked`)
      if (res.status === 404) return { revoked: false, error: 'No revocation mapping found for this credential' }
      if (!res.ok) return { revoked: false, error: `VDR returned ${res.status}` }
      const data = await res.json() as { revoked: boolean }
      return { revoked: data.revoked }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { revoked: false, error: message }
    }
  }

  /**
   * Lista todas las credenciales con su estado de revocación.
   * Combina listCredentials + checkCredentialStatus para cada una.
   */
  async listCredentialsWithStatus(): Promise<{ credentials: { id?: string; revoked: boolean | null; credential: unknown }[] } | { error: string }> {
    const agent = holderAgent as any
    if (!agent) return { error: 'Agent not ready' }
    const w3cApi = agent.w3cCredentials
    if (!w3cApi?.findAllByQuery) return { credentials: [] }

    const creds = await w3cApi.findAllByQuery({})
    const results: { id?: string; revoked: boolean | null; credential: unknown }[] = []

    for (const c of creds as any[]) {
      const payload = toCredentialPayload(c.encoded, c.jsonCredential) as any
      const id: string | undefined = payload?.id
      let revoked: boolean | null = null
      if (id) {
        const status = await this.checkCredentialStatus(id)
        revoked = status.error ? null : status.revoked
      }
      results.push({ id, revoked, credential: payload })
    }

    return { credentials: results }
  }
}
