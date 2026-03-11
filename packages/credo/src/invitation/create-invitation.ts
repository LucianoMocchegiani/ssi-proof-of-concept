import type { Agent } from '@credo-ts/core'

export interface CreateInvitationOptions {
  /** Dominio para la URL (ej. https://example.org) */
  domain?: string
}

export interface CreateInvitationResult {
  invitationUrl: string
  outOfBandRecord: unknown
}

/**
 * Crea una invitación OOB desde el agente.
 */
export async function createInvitation(
  agent: Agent,
  invitationDid: string,
  options?: CreateInvitationOptions
): Promise<CreateInvitationResult> {
  const domain = options?.domain ?? 'https://example.org'
  const didcomm = (agent as { didcomm: { oob: { createInvitation(opts: { invitationDid: string }): Promise<{ outOfBandInvitation: { toUrl(opts: { domain: string }): string }; toJSON(): unknown }> } } }).didcomm
  const outOfBandRecord = await didcomm.oob.createInvitation({
    invitationDid,
  })
  const invitationUrl = outOfBandRecord.outOfBandInvitation.toUrl({ domain })
  return {
    invitationUrl,
    outOfBandRecord: outOfBandRecord.toJSON ? outOfBandRecord.toJSON() : outOfBandRecord,
  }
}
