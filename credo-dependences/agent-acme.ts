import { Agent, DependencyManager, InjectionSymbols } from '@credo-ts/core'
import { agentDependencies, DidCommHttpInboundTransport } from '@credo-ts/node'
import { DidCommWsOutboundTransport, DidCommHttpOutboundTransport, DidCommConnectionsModule, DidCommModule } from '@credo-ts/didcomm'
import { InMemoryStorageService } from '../inmemory-storage'
import { DidCommModuleConfig } from '@credo-ts/didcomm'
import { Kms } from '@credo-ts/core'
import { MockKeyManagementService } from './mock-kms'

export const initializeAcmeAgent = async () => {
  const config = {
    label: 'demo-agent-acme',
    walletConfig: {
      id: 'mainAcme',
      key: 'demoagentacme0000000000000000000',
    },
    endpoints: ['http://localhost:3001'],
  } as any

  const dependencyManager = new DependencyManager()
  // Storage: use remote storage service if requested
  if (process.env.USE_REMOTE_STORAGE === 'true') {
    const { RemoteStorageService } = await import('./remote-storage')
    dependencyManager.registerInstance(InjectionSymbols.StorageService, new RemoteStorageService(process.env.REMOTE_STORAGE_URL))
  } else {
    dependencyManager.registerInstance(InjectionSymbols.StorageService, new InMemoryStorageService())
  }
  dependencyManager.registerInstance(DidCommModuleConfig, new DidCommModuleConfig({ endpoints: ['http://localhost:3001'] }))
  // Register mock KMS backend for POC
  if (process.env.USE_REMOTE_KMS === 'true') {
    const { RemoteKeyManagementService } = await import('./remote-kms')
    dependencyManager.registerInstance(
      Kms.KeyManagementModuleConfig,
      new Kms.KeyManagementModuleConfig({ backends: [new MockKeyManagementService(), new RemoteKeyManagementService(process.env.REMOTE_KMS_URL)], defaultBackend: RemoteKeyManagementService.backend })
    )
  } else {
    dependencyManager.registerInstance(
      Kms.KeyManagementModuleConfig,
      new Kms.KeyManagementModuleConfig({ backends: [new MockKeyManagementService()], defaultBackend: MockKeyManagementService.backend })
    )
  }

  // Build key management module based on configuration
  let keyManagementModule: any
  // For POC the runtime KeyManagement module uses the local Mock backend.
  // The KeyManagementModuleConfig may include a remote backend (registered above),
  // but the in-process module keeps MockKeyManagementService to avoid typing/runtime issues.
  keyManagementModule = new Kms.KeyManagementModule({
    backends: [new MockKeyManagementService()],
    defaultBackend: MockKeyManagementService.backend,
  }) as any

  const agent = new Agent(
    {
      config,
      modules: {
        // Key management module (mock or remote)
        keyManagement: keyManagementModule,
        didcomm: new DidCommModule({
          // usar puerto distinto para evitar conflictos en POC
          endpoints: ['http://localhost:3101'],
          transports: {
            inbound: [new DidCommHttpInboundTransport({ port: 3101 })],
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

