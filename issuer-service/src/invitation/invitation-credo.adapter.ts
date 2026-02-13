import { issuerAgent } from '../agent/agent-store'
import { getIssuerDid } from '../agent/issuer-did-store'

/**
 * Crea invitación OOB según DIDComm 0434 (Out-of-Band 1.1).
 *
 * Usa el did:custom del issuer (fijado al arrancar). Credo crea invitación con ese DID.
 * El holder resuelve el DID para obtener serviceEndpoint.
 */
export const createNewInvitation = async (
  options?: { domain?: string }
) => {
  const domain = options?.domain ?? 'https://example.org'
  if (!issuerAgent) throw new Error('No issuer agent initialized')
  const agent = issuerAgent as any

  const invitationDid = getIssuerDid()
  const outOfBandRecord = await agent.didcomm.oob.createInvitation({
    invitationDid,
  })

  return {
    invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({ domain }),
    outOfBandRecord,
  }
}

/** Invitación legacy según 0160. Deprecada en favor de createNewInvitation (OOB 1.1). */
export const _createLegacyInvitation = async () => {
  if (!issuerAgent) throw new Error('No issuer agent initialized')
  const { invitation } = await (issuerAgent as any).didcomm.createLegacyInvitation()
  return invitation.toUrl({ domain: 'https://example.org' })
}
