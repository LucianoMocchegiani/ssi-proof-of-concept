import type { DependencyManager } from '@credo-ts/core'
import { Kms } from '@credo-ts/core'
import { envConfig } from '../config'
import { InternalKeyManagementService } from '../kms/internal-kms.adapter'
import { ExternalKeyManagementService } from '../kms/external-kms.adapter'

/** Registra KMS en el agente holder. */
export function registerKmsConfig(dependencyManager: DependencyManager) {
  if (envConfig.kmsMode === 'external') {
    dependencyManager.registerInstance(
      Kms.KeyManagementModuleConfig,
      new Kms.KeyManagementModuleConfig({
        backends: [new (ExternalKeyManagementService as any)(envConfig.externalKmsUrl)],
        defaultBackend: (ExternalKeyManagementService as any).backend,
      })
    )
  } else {
    dependencyManager.registerInstance(
      Kms.KeyManagementModuleConfig,
      new Kms.KeyManagementModuleConfig({
        backends: [new InternalKeyManagementService(envConfig.internalKmsSqlitePath)],
        defaultBackend: InternalKeyManagementService.backend,
      })
    )
  }
}

/** Construye KeyManagementModule según env. */
export function buildKeyManagementModule(): any {
  if (envConfig.kmsMode === 'external') {
    return new Kms.KeyManagementModule({
      backends: [new (ExternalKeyManagementService as any)(envConfig.externalKmsUrl)],
      defaultBackend: (ExternalKeyManagementService as any).backend,
    }) as any
  }
  return new Kms.KeyManagementModule({
    backends: [new InternalKeyManagementService(envConfig.internalKmsSqlitePath)],
    defaultBackend: InternalKeyManagementService.backend,
  }) as any
}
