import { Injectable } from '@nestjs/common'
import { requestProof } from '@one/credo'
import { verifierAgent } from '../agent/agent-store'

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
    return requestProof(verifierAgent, params)
  }

  async getProofs(): Promise<{ proofs: Array<{ id: string; state: string }> }> {
    const agent = verifierAgent as { didcomm?: { proofs?: { getAll: () => Promise<Array<{ id: string; state: string }>> } } }
    if (!agent?.didcomm?.proofs) return { proofs: [] }
    try {
      const all = await agent.didcomm.proofs.getAll()
      return {
        proofs: all.map((p) => ({ id: p.id, state: p.state })),
      }
    } catch {
      return { proofs: [] }
    }
  }
}
