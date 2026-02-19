import { Injectable } from '@nestjs/common'
import { verifierAgent } from '../agent/agent-store'

/** Definición de presentación DIF PEX mínima para credenciales GenericCredential (JSON-LD). */
const DEFAULT_PRESENTATION_DEFINITION = {
  id: 'req-gen-1',
  input_descriptors: [
    {
      id: 'desc-generic',
      name: 'Generic Credential',
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
    },
  ],
}

@Injectable()
export class CredentialsService {
  async requestProof(params: {
    connectionId: string
    presentationDefinition?: Record<string, unknown>
    challenge?: string
    domain?: string
  }): Promise<{
    proofExchangeRecordId: string
    state: string
    error?: string
  }> {
    const agent = verifierAgent as any
    if (!agent?.didcomm?.proofs) {
      return { proofExchangeRecordId: '', state: 'error', error: 'Agent or proofs module not ready' }
    }
    try {
      const pd = params.presentationDefinition ?? DEFAULT_PRESENTATION_DEFINITION
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
      }
    } catch (err: any) {
      return {
        proofExchangeRecordId: '',
        state: 'error',
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
