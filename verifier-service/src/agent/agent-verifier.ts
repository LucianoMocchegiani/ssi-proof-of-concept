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
import { verifierAgentConfig } from './agent-verifier.config'
import { registerStorageAdapter } from './agent-verifier-storage'
import { buildKeyManagementModule, registerKmsConfig } from './agent-verifier-kms'
import { buildDidsModule } from './agent-verifier-dids'

/**
 * Inicializa el agente Credo del verifier.
 * Registra storage, KMS, DIDs y DidComm.
 */
export const initializeVerifierAgent = async () => {
  const dependencyManager = new DependencyManager()

  registerStorageAdapter(dependencyManager)
  dependencyManager.registerInstance(
    DidCommModuleConfig,
    new DidCommModuleConfig({ endpoints: [envConfig.didcommEndpoint] })
  )
  registerKmsConfig(dependencyManager)

  const agent = new Agent(
    {
      config: verifierAgentConfig,
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

/** Obtiene o crea el did:custom del verifier. Se llama al arrancar. */
export async function ensureVerifierDid(agent: any): Promise<string> {
  const created = await agent.dids.getCreatedDids({ method: 'custom' })
  if (created?.length > 0) return created[0].did
  const result = await agent.dids.create({ method: 'custom', options: {} })
  const did = result.did ?? result.didState?.did
  if (!did) throw new Error('Failed to create verifier DID')
  return did
}
