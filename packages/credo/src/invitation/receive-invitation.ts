import type { Agent } from '@credo-ts/core'

export interface ReceiveInvitationOptions {
  /** Etiqueta del agente para la conexión */
  label?: string
}

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
 * Recibe una invitación OOB (URL del issuer/verifier).
 */
export async function receiveInvitation(
  agent: Agent,
  invitationUrl: string,
  ourDid: string,
  options?: ReceiveInvitationOptions
): Promise<unknown> {
  const normalizedUrl = normalizeInvitationUrl(invitationUrl)
  const agentConfig = (agent as { config?: { toJSON?: () => { label?: string } } }).config
  const label =
    options?.label ??
    (agentConfig?.toJSON ? agentConfig.toJSON()?.label : undefined) ??
    'agent'

  const didcomm = (agent as {
    didcomm: {
      oob: {
        receiveInvitationFromUrl(
          url: string,
          opts: { label: string; ourDid: string; reuseConnection: boolean }
        ): Promise<{ outOfBandRecord: unknown }>
      }
    }
  }).didcomm

  const { outOfBandRecord } = await didcomm.oob.receiveInvitationFromUrl(
    normalizedUrl,
    {
      label,
      ourDid,
      reuseConnection: true,
    }
  )
  return outOfBandRecord
}
