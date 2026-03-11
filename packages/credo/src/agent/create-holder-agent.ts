import { Agent, DependencyManager, W3cCredentialsModule } from '@credo-ts/core'
import { agentDependencies, DidCommWsInboundTransport } from '@credo-ts/node'
import {
  DidCommModule,
  DidCommHttpOutboundTransport,
  DidCommModuleConfig,
  DidCommCredentialV2Protocol,
  DidCommJsonLdCredentialFormatService,
  DidCommProofV2Protocol,
  DidCommDifPresentationExchangeProofFormatService,
} from '@credo-ts/didcomm'
import { buildDidsModule } from './build-dids-module'
import { registerWalletConfig } from './register-wallet'
import { registerKmsConfig, buildKeyManagementModule } from './register-kms'
import { DidCommWsOutboundTransportDelayedClose } from '../adapters/transport/ws-outbound-delayed-close'
import type { CredoAgentBaseConfig } from '../types/config.types'
import type { CreateHolderAgentOptions } from './create-agent-options.types'
import { setupHolderListeners } from '../listeners/holder-listeners'

/**
 * Crea e inicializa el agente Credo del holder con listeners de credentials y proofs.
 */
export async function createHolderAgent(
  config: CredoAgentBaseConfig,
  options?: CreateHolderAgentOptions
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
        port: config.didcommPort ?? 9205,
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
          credentials: {
            credentialProtocols: [
              new DidCommCredentialV2Protocol({
                credentialFormats: [new DidCommJsonLdCredentialFormatService()],
              }),
            ],
          },
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
  setupHolderListeners(agent, { label: config.label, logger: options?.logger })
  return agent
}
