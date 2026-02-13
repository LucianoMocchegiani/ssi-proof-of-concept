import type { DependencyManager } from '@credo-ts/core'
import { Kms } from '@credo-ts/core'
import { envConfig } from '../config'
import { MockKeyManagementService } from '../kms/inmemory-kms.adapter'
import { RemoteKeyManagementService } from '../kms/remote-kms.adapter'

/** Registra KMS en el agente holder. */
export function registerKmsConfig(dependencyManager: DependencyManager) {
  if (envConfig.useRemoteKms) {
    dependencyManager.registerInstance(
      Kms.KeyManagementModuleConfig,
      new Kms.KeyManagementModuleConfig({
        backends: [new MockKeyManagementService(), new (RemoteKeyManagementService as any)(envConfig.remoteKmsUrl)],
        defaultBackend: (RemoteKeyManagementService as any).backend,
      })
    )
  } else {
    dependencyManager.registerInstance(
      Kms.KeyManagementModuleConfig,
      new Kms.KeyManagementModuleConfig({
        backends: [new MockKeyManagementService()],
        defaultBackend: MockKeyManagementService.backend,
      })
    )
  }
}

/** Construye KeyManagementModule según env. */
export function buildKeyManagementModule(): any {
  if (envConfig.useRemoteKms) {
    return new Kms.KeyManagementModule({
      backends: [new MockKeyManagementService(), new (RemoteKeyManagementService as any)(envConfig.remoteKmsUrl)],
      defaultBackend: (RemoteKeyManagementService as any).backend,
    }) as any
  }
  return new Kms.KeyManagementModule({
    backends: [new MockKeyManagementService()],
    defaultBackend: MockKeyManagementService.backend,
  }) as any
}
