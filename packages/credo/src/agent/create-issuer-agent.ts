import { Agent, DependencyManager, W3cCredentialsModule } from '@credo-ts/core'
import { agentDependencies, DidCommWsInboundTransport } from '@credo-ts/node'
import {
  DidCommModule,
  DidCommHttpOutboundTransport,
  DidCommModuleConfig,
  DidCommCredentialV2Protocol,
  DidCommJsonLdCredentialFormatService,
} from '@credo-ts/didcomm'
import { buildDidsModule } from './build-dids-module'
import { registerWalletConfig } from './register-wallet'
import { registerKmsConfig, buildKeyManagementModule } from './register-kms'
import { DidCommWsOutboundTransportDelayedClose } from '../adapters/transport/ws-outbound-delayed-close'
import type { CredoAgentBaseConfig } from '../types/config.types'
import type { CreateIssuerAgentOptions } from './create-agent-options.types'
import { setupIssuerListeners } from '../listeners/issuer-listeners'

/**
 * Crea e inicializa el agente Credo del issuer con listeners de credenciales.
 */
export async function createIssuerAgent(
  config: CredoAgentBaseConfig,
  options: CreateIssuerAgentOptions
): Promise<Agent> {
  const dependencyManager = new DependencyManager()

  registerWalletConfig(dependencyManager, config.wallet)
  registerKmsConfig(dependencyManager, config.kms)
  dependencyManager.registerInstance(
    DidCommModuleConfig,
    new DidCommModuleConfig({ endpoints: [config.didcommEndpoint] })
  )

  const inboundTransport = options.wsServer
    ? new DidCommWsInboundTransport({ server: options.wsServer as import('ws').WebSocketServer } as {
        server: import('ws').WebSocketServer
      })
    : new DidCommWsInboundTransport({
        port: config.didcommPort ?? 3001,
      })

  const closeDelayMs = options.transportCloseDelayMs ?? 10000

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
        }),
      },
      dependencies: agentDependencies,
    },
    dependencyManager
  )

  await agent.initialize()
  setupIssuerListeners(agent, {
    label: config.label,
    vdrServiceUrl: config.vdrServiceUrl,
    getIssuerDid: options.getIssuerDid,
    getStatusList: options.getStatusList,
    hasStatusList: options.hasStatusList,
    logger: options.logger,
  })
  return agent
}
