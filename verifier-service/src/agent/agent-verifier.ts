import {
  createVerifierAgent,
  ensureDid,
  createInvitation,
  buildCredoConfigFromEnv,
} from '@one/credo'
import type { CredoLogger } from '@one/credo'
import { envConfig } from '../config'
import { getVerifierDid } from './verifier-did-store'

export const initializeVerifierAgent = async (wsServer?: object, logger?: CredoLogger) => {
  const config = buildCredoConfigFromEnv(envConfig)
  return createVerifierAgent(config, { wsServer, logger })
}

export const ensureVerifierDid = (agent: Awaited<ReturnType<typeof createVerifierAgent>>) =>
  ensureDid(agent, { method: 'custom', vdrServiceUrl: envConfig.vdrServiceUrl })

export async function createNewInvitation(options?: { domain?: string }) {
  const { verifierAgent } = await import('./agent-store')
  if (!verifierAgent) throw new Error('No verifier agent initialized')
  const result = await createInvitation(verifierAgent, getVerifierDid(), {
    domain: options?.domain ?? envConfig.invitationUrlPrefix,
  })
  return { invitationUrl: result.invitationUrl, outOfBandRecord: result.outOfBandRecord }
}
