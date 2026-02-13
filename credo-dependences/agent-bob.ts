import { Agent, DependencyManager, InjectionSymbols } from '@credo-ts/core'
import { agentDependencies } from '@credo-ts/node'
import {
  DidCommWsOutboundTransport,
  DidCommHttpOutboundTransport,
} from '@credo-ts/didcomm'
import { InMemoryStorageService } from '../inmemory-storage'
import { DidCommModule } from '@credo-ts/didcomm'
import { DidCommHttpInboundTransport } from '@credo-ts/node'
import { DidCommModuleConfig } from '@credo-ts/didcomm'
import { Kms } from '@credo-ts/core'
import { MockKeyManagementService } from './mock-kms'

export const initializeBobAgent = async () => {
  const config = {
    label: 'demo-agent-bob',
    walletConfig: {
      id: 'mainBob',
      key: 'demoagentbob00000000000000000000',
    },
  } as any

  const dependencyManager = new DependencyManager()
  if (process.env.USE_REMOTE_STORAGE === 'true') {
    const { RemoteStorageService } = await import('./remote-storage')
    dependencyManager.registerInstance(InjectionSymbols.StorageService, new RemoteStorageService(process.env.REMOTE_STORAGE_URL))
  } else {
    dependencyManager.registerInstance(InjectionSymbols.StorageService, new InMemoryStorageService())
  }
  // Register a DidCommModuleConfig instance to satisfy tsyringe injection metadata
  dependencyManager.registerInstance(DidCommModuleConfig, new DidCommModuleConfig({ endpoints: ['http://localhost:9002'] }))
  // Register a simple mock KMS for POC (sin askar)
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

  const agent = new Agent(
    {
      config,
      modules: {
        // Key management module (use local Mock backend in-process)
        keyManagement: new Kms.KeyManagementModule({
          backends: [new MockKeyManagementService()],
          defaultBackend: MockKeyManagementService.backend,
        }) as any,
        didcomm: new DidCommModule({
          // usar puerto distinto para evitar EADDRINUSE en POC
          endpoints: ['http://localhost:9102'],
          transports: {
            inbound: [new DidCommHttpInboundTransport({ port: 9102 })],
            outbound: [new DidCommHttpOutboundTransport(), new DidCommWsOutboundTransport()],
          },
          connections: {
            autoAcceptConnections: true,
          },
          // desactivar mediator/mediationRecipient en POC en memoria
          mediator: false,
          mediationRecipient: false,
        }),
      },
      dependencies: agentDependencies,
    },
    dependencyManager
  )

  // Inicializar
  await agent.initialize()

  return agent
}

