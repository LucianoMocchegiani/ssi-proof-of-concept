import type { DependencyManager } from '@credo-ts/core'
import { Kms } from '@credo-ts/core'
import { InternalKeyManagementService } from '../adapters/kms/internal-kms.adapter'
import { ExternalKeyManagementService } from '../adapters/kms/external-kms.adapter'
import type { KmsConfig } from '../types/config.types'

/**
 * Registra la configuración KMS en el DependencyManager del agente.
 */
export function registerKmsConfig(
  dependencyManager: DependencyManager,
  config: KmsConfig
): void {
  if (config.mode === 'external') {
    const url = config.externalUrl ?? ''
    dependencyManager.registerInstance(
      Kms.KeyManagementModuleConfig,
      new Kms.KeyManagementModuleConfig({
        backends: [new ExternalKeyManagementService(url)],
        defaultBackend: ExternalKeyManagementService.backend,
      })
    )
  } else {
    dependencyManager.registerInstance(
      Kms.KeyManagementModuleConfig,
      new Kms.KeyManagementModuleConfig({
        backends: [new InternalKeyManagementService(config.connection)],
        defaultBackend: InternalKeyManagementService.backend,
      })
    )
  }
}

/**
 * Construye KeyManagementModule para el agente.
 */
export function buildKeyManagementModule(config: KmsConfig): Kms.KeyManagementModule {
  if (config.mode === 'external') {
    const url = config.externalUrl ?? ''
    return new Kms.KeyManagementModule({
      backends: [new ExternalKeyManagementService(url)],
      defaultBackend: ExternalKeyManagementService.backend,
    })
  }
  return new Kms.KeyManagementModule({
    backends: [new InternalKeyManagementService(config.connection)],
    defaultBackend: InternalKeyManagementService.backend,
  })
}
