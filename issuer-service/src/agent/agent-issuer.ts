import {
  createIssuerAgent,
  ensureDid,
  ensureStatusList,
  createInvitation,
  buildCredoConfigFromEnv,
} from '@one/credo'
import type { CredoLogger } from '@one/credo'
import { envConfig } from '../config'
import { getIssuerDid } from './issuer-did-store'
import { getStatusList, hasStatusList } from './issuer-status-list-store'

export const initializeIssuerAgent = async (wsServer?: object, logger?: CredoLogger) => {
  const config = buildCredoConfigFromEnv(envConfig)
  return createIssuerAgent(config, {
    wsServer,
    logger,
    getIssuerDid: () => getIssuerDid(),
    getStatusList: () => getStatusList(),
    hasStatusList: () => hasStatusList(),
  })
}

export const ensureIssuerDid = (agent: Awaited<ReturnType<typeof createIssuerAgent>>) =>
  ensureDid(agent, { method: 'custom', vdrServiceUrl: envConfig.vdrServiceUrl })

export const ensureIssuerStatusList = (issuerDid: string) =>
  ensureStatusList(issuerDid, envConfig.vdrServiceUrl)

export async function createNewInvitation(options?: { domain?: string }) {
  const { issuerAgent } = await import('./agent-store')
  if (!issuerAgent) throw new Error('No issuer agent initialized')
  const result = await createInvitation(issuerAgent, getIssuerDid(), {
    domain: options?.domain ?? envConfig.invitationUrlPrefix,
  })
  return { invitationUrl: result.invitationUrl, outOfBandRecord: result.outOfBandRecord }
}
