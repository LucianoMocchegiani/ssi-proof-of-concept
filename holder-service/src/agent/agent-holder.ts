import {
  createHolderAgent,
  ensureDid,
  receiveInvitation,
  buildCredoConfigFromEnv,
} from '@one/credo'
import type { CredoLogger } from '@one/credo'
import { envConfig } from '../config'
import { getHolderDid } from './holder-did-store'

export const initializeHolderAgent = async (wsServer?: object, logger?: CredoLogger) => {
  const config = buildCredoConfigFromEnv(envConfig)
  return createHolderAgent(config, { wsServer, logger })
}

export const ensureHolderDid = (agent: Awaited<ReturnType<typeof createHolderAgent>>) =>
  ensureDid(agent, { method: 'custom', vdrServiceUrl: envConfig.vdrServiceUrl })

export async function receiveInvitationFromUrl(invitationUrl: string) {
  const { holderAgent } = await import('./agent-store')
  if (!holderAgent) throw new Error('No holder agent initialized')
  return receiveInvitation(holderAgent, invitationUrl, getHolderDid())
}
