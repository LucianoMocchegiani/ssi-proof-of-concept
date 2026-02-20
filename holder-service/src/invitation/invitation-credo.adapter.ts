import { holderAgent } from '../agent/agent-store'
import { getHolderDid } from '../agent/holder-did-store'

/**
 * Normaliza URL de invitación: Credo usa `oob`, algunos sistemas usan `_oob`.
 */
function normalizeInvitationUrl(url: string): string {
  if (url.includes('_oob=') && !url.includes('oob=')) {
    return url.replace(/_oob=/g, 'oob=')
  }
  return url
}

/**
 * Recibe invitación OOB (URL del issuer).
 *
 * Usa did:custom del holder (fijado al arrancar) como ourDid.
 */
export const receiveInvitation = async (invitationUrl: string) => {
  if (!holderAgent) throw new Error('No holder agent initialized')
  const normalizedUrl = normalizeInvitationUrl(invitationUrl)
  const agentLabel = (holderAgent as any).config?.toJSON?.().label ?? 'holder-agent'
  const { outOfBandRecord } = await (holderAgent as any).didcomm.oob.receiveInvitationFromUrl(normalizedUrl, {
    label: agentLabel,
    ourDid: getHolderDid(),
    reuseConnection: true,
  })
  return outOfBandRecord
}
