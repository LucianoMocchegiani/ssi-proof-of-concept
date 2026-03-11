import { Agent, DependencyManager, W3cCredentialsModule } from '@credo-ts/core'
import { agentDependencies, DidCommWsInboundTransport } from '@credo-ts/node'
import {
  DidCommModule,
  DidCommHttpOutboundTransport,
  DidCommModuleConfig,
  DidCommProofV2Protocol,
  DidCommDifPresentationExchangeProofFormatService,
} from '@credo-ts/didcomm'
import { buildDidsModule } from './build-dids-module'
import { registerWalletConfig } from './register-wallet'
import { registerKmsConfig, buildKeyManagementModule } from './register-kms'
import { DidCommWsOutboundTransportDelayedClose } from '../adapters/transport/ws-outbound-delayed-close'
import type { CredoAgentBaseConfig } from '../types/config.types'
import type { CreateVerifierAgentOptions } from './create-agent-options.types'
import { setupVerifierListeners } from '../listeners/verifier-listeners'

/**
 * Crea e inicializa el agente Credo del verifier con listeners de proofs y verificación de revocación.
 */
export async function createVerifierAgent(
  config: CredoAgentBaseConfig,
  options?: CreateVerifierAgentOptions
): Promise<Agent> {
  const dependencyManager = new DependencyManager()

  registerWalletConfig(dependencyManager, config.wallet)
  registerKmsConfig(dependencyManager, config.kms)
  dependencyManager.registerInstance(
    DidCommModuleConfig,
    new DidCommModuleConfig({ endpoints: [config.didcommEndpoint] })
  )

  const inboundTransport = options?.wsServer
    ? new DidCommWsInboundTransport({ server: options.wsServer } as {
        server: import('ws').WebSocketServer
      })
    : new DidCommWsInboundTransport({
        port: config.didcommPort ?? 9204,
      })

  const closeDelayMs = options?.transportCloseDelayMs ?? 10000

  const agent = new Agent(
    {
      config: {
        label: config.label,
        walletConfig: { id: config.walletId, key: config.walletKey },
        autoUpdateStorageOnStartup: true,
      } as unknown as InstanceType<typeof Agent>['config'],
      modules: {
        keyManagement: buildKeyManagementModule(config.kms),
        dids: buildDidsModule({
          vdrServiceUrl: config.vdrServiceUrl,
          didcommEndpoint: config.didcommEndpoint,
        }),
        w3cCredentials: new W3cCredentialsModule({}),
        didcomm: new DidCommModule({
          endpoints: [config.didcommEndpoint],
          transports: {
            inbound: [inboundTransport],
            outbound: [
              new DidCommHttpOutboundTransport(),
              new DidCommWsOutboundTransportDelayedClose(closeDelayMs),
            ],
          },
          connections: { autoAcceptConnections: true },
          mediator: false,
          mediationRecipient: false,
          credentials: false,
          proofs: {
            proofProtocols: [
              new DidCommProofV2Protocol({
                proofFormats: [new DidCommDifPresentationExchangeProofFormatService()],
              }),
            ],
          },
        }),
      },
      dependencies: agentDependencies,
    },
    dependencyManager
  )

  await agent.initialize()
  setupVerifierListeners(agent, {
    label: config.label,
    vdrServiceUrl: config.vdrServiceUrl,
    logger: options?.logger,
  })
  return agent
}
