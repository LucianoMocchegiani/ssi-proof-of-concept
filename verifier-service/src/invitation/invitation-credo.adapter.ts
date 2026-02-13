import { verifierAgent } from '../agent/agent-store'
import { getVerifierDid } from '../agent/verifier-did-store'

/**
 * Crea invitación OOB del verifier (igual flujo que issuer).
 * Usa el did:custom del verifier (fijado al arrancar).
 */
export const createNewInvitation = async (options?: { domain?: string }) => {
  const domain = options?.domain ?? 'https://example.org'
  if (!verifierAgent) throw new Error('No verifier agent initialized')
  const agent = verifierAgent as any

  const invitationDid = getVerifierDid()
  const outOfBandRecord = await agent.didcomm.oob.createInvitation({
    invitationDid,
  })

  return {
    invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({ domain }),
    outOfBandRecord,
  }
}
