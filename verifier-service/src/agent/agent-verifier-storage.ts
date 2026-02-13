import { DependencyManager, InjectionSymbols } from '@credo-ts/core'
import { envConfig } from '../config'
import { InMemoryStorageService } from '../storage/inmemory-storage.adapter'
import { RemoteStorageService } from '../storage/remote-storage.adapter'

/**
 * Registra el adaptador de storage en el agente verifier.
 * Usa RemoteStorageService si USE_REMOTE_STORAGE=true, else InMemoryStorageService.
 */
export function registerStorageAdapter(dependencyManager: DependencyManager) {
  if (envConfig.useRemoteStorage) {
    dependencyManager.registerInstance(
      InjectionSymbols.StorageService,
      new RemoteStorageService(envConfig.remoteStorageUrl, envConfig.walletId)
    )
  } else {
    dependencyManager.registerInstance(InjectionSymbols.StorageService, new InMemoryStorageService())
  }
}
