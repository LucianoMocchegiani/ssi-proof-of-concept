import { Injectable, Logger } from '@nestjs/common'
import { JsonTransformer } from '@credo-ts/core'
import { holderAgent } from '../agent/agent-store'
import { getHolderDid } from '../agent/holder-did-store'
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
}
