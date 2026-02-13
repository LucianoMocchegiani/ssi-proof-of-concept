import { Agent, DependencyManager } from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import {
  DidCommHttpOutboundTransport,
  DidCommWsOutboundTransport,
} from '@credo-ts/didcomm'
import { DidCommModule } from '@credo-ts/didcomm'
import { DidCommHttpInboundTransport } from '@credo-ts/node'
import { DidCommModuleConfig } from '@credo-ts/didcomm'
import { envConfig } from '../config'
import { holderAgentConfig } from './agent-holder.config'
import { registerStorageAdapter } from './agent-holder-storage'
import { buildKeyManagementModule, registerKmsConfig } from './agent-holder-kms'
import { buildDidsModule } from './agent-holder-dids'

/**
 * Inicializa el agente Credo del holder.
 * Registra storage, KMS, DIDs y DidComm.
 */
export const initializeHolderAgent = async () => {
  const dependencyManager = new DependencyManager()

  registerStorageAdapter(dependencyManager)
  dependencyManager.registerInstance(
    DidCommModuleConfig,
    new DidCommModuleConfig({ endpoints: [envConfig.didcommEndpoint] })
  )
  registerKmsConfig(dependencyManager)

  const agent = new Agent(
    {
      config: holderAgentConfig,
      modules: {
        keyManagement: buildKeyManagementModule(),
        dids: buildDidsModule(),
        didcomm: new DidCommModule({
          endpoints: [envConfig.didcommEndpoint],
          transports: {
            inbound: [new DidCommHttpInboundTransport({ port: envConfig.didcommPort })],
            outbound: [new DidCommHttpOutboundTransport(), new DidCommWsOutboundTransport()],
          },
          connections: { autoAcceptConnections: true },
          mediator: false,
          mediationRecipient: false,
        }),
      },
      dependencies: agentDependencies,
    },
    dependencyManager
  )

  await agent.initialize()
  return agent
}

/** Obtiene o crea el did:custom del holder. Se llama al arrancar. */
export async function ensureHolderDid(agent: any): Promise<string> {
  const created = await agent.dids.getCreatedDids({ method: 'custom' })
  if (created?.length > 0) return created[0].did
  const result = await agent.dids.create({ method: 'custom', options: {} })
  const did = result.did ?? result.didState?.did
  if (!did) throw new Error('Failed to create holder DID')
  return did
}
