import { Injectable } from '@nestjs/common'
import { verifierAgent } from '../agent/agent-store'

const MAX_DESCRIPTORS = 20

/**
 * Genera una Presentation Definition DIF PEX.
 *
 * - credentialCount = N: genera N descriptores obligatorios (el holder DEBE tener N)
 * - credentialCount = undefined: genera MAX_DESCRIPTORS descriptores opcionales con
 *   submission_requirements min:1 → el holder presenta TODAS las que tenga (hasta MAX)
 */
function buildPresentationDefinition(credentialCount?: number) {
  const count = credentialCount ?? MAX_DESCRIPTORS
  const descriptors = Array.from({ length: count }, (_, i) => ({
    id: `desc-generic-${i + 1}`,
    name: `Generic Credential #${i + 1}`,
    group: ['generic'],
    constraints: {
      fields: [
        {
          path: ['$.type'],
          filter: {
            type: 'array',
            contains: { const: 'GenericCredential' },
          },
        },
      ],
    },
  }))

  const pd: Record<string, unknown> = {
    id: credentialCount ? `req-gen-${credentialCount}` : 'req-gen-all',
    input_descriptors: descriptors,
  }

  if (!credentialCount) {
    pd.submission_requirements = [{ rule: 'pick', min: 1, from: 'generic' }]
  }

  return pd
}

@Injectable()
export class CredentialsService {
  async requestProof(params: {
    connectionId: string
    presentationDefinition?: Record<string, unknown>
    credentialCount?: number
    challenge?: string
    domain?: string
  }): Promise<{
    proofExchangeRecordId: string
    state: string
    mode: string
    error?: string
  }> {
    const agent = verifierAgent as any
    if (!agent?.didcomm?.proofs) {
      return { proofExchangeRecordId: '', state: 'error', mode: 'error', error: 'Agent or proofs module not ready' }
    }
    try {
      const pd = params.presentationDefinition ?? buildPresentationDefinition(params.credentialCount)
      const mode = params.credentialCount ? `exact:${params.credentialCount}` : 'all'
      const record = await agent.didcomm.proofs.requestProof({
        connectionId: params.connectionId,
        protocolVersion: 'v2',
        proofFormats: {
          presentationExchange: {
            presentationDefinition: pd,
            options: {
              challenge: params.challenge ?? `challenge-${Date.now()}`,
              domain: params.domain,
            },
          },
        },
      })
      return {
        proofExchangeRecordId: record.id,
        state: record.state,
        mode,
      }
    } catch (err: any) {
      return {
        proofExchangeRecordId: '',
        state: 'error',
        mode: 'error',
        error: err?.message ?? String(err),
      }
    }
  }

  /** Lista intercambios de proof (para debug). */
  async getProofs(): Promise<{ proofs: Array<{ id: string; state: string }> }> {
    const agent = verifierAgent as any
    if (!agent?.didcomm?.proofs) return { proofs: [] }
    try {
      const all = await agent.didcomm.proofs.getAll()
      return {
        proofs: all.map((p: any) => ({ id: p.id, state: p.state })),
      }
    } catch {
      return { proofs: [] }
    }
  }
}
