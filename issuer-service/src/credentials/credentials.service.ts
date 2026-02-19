import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { issuerAgent } from '../agent/agent-store'
import { getIssuerDid } from '../agent/issuer-did-store'
import type { CredentialExchangeDto } from './credential-exchange.dto'

@Injectable()
export class CredentialsService {
  async offerCredential(
    params: CredentialExchangeDto,
  ): Promise<{ credentialExchangeId: string; state: string } | { error: string }> {
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
    const credential = {
      '@context': params.credential['@context'] ?? [
        'https://www.w3.org/2018/credentials/v1',
        'http://schema.org/',
        Object.fromEntries(customTypes.map((t) => [t, `https://www.w3.org/2018/credentials#${t}`])),
      ],
      id: `urn:uuid:${randomUUID()}`,
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
      return { credentialExchangeId: exchange.id, state: exchange.state }
    } catch (err: any) {
      return { error: err?.message ?? String(err) }
    }
  }
}
