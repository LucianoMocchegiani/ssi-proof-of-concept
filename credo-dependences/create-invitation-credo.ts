import { Agent } from "@credo-ts/core"

//new invitation
//Este método creará una invitación utilizando el método heredado de acuerdo con 0434: Protocolo fuera de banda 1.1 .
export const createNewInvitation = async (
  agent: Agent,
  options?: { domain?: string }
) => {
  const domain = options?.domain ?? 'https://example.org'
  const outOfBandRecord = await (agent as any).didcomm.oob.createInvitation()

  return {
    invitationUrl: outOfBandRecord.outOfBandInvitation.toUrl({ domain }),
    outOfBandRecord,
  }
}

//legacy invitation
//Este método creará una invitación utilizando el método heredado de acuerdo con 0160: Protocolo de conexión 1.6 .
export const _createLegacyInvitation = async (agent: Agent) => {
    const { invitation } = await (agent as any).didcomm.createLegacyInvitation()

    return invitation.toUrl({ domain: 'https://example.org' })
  }

