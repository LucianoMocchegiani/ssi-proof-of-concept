import { DependencyManager, InjectionSymbols } from '@credo-ts/core'
import { envConfig } from '../config'
import { InternalWalletStorageService } from '../wallet/internal-wallet.adapter'
import { ExternalWalletStorageService } from '../wallet/external-wallet.adapter'

/** Registra el adaptador de wallet en el agente verifier. */
export function registerWalletAdapter(dependencyManager: DependencyManager) {
  if (envConfig.walletMode === 'external') {
    dependencyManager.registerInstance(
      InjectionSymbols.StorageService,
      new ExternalWalletStorageService(envConfig.externalWalletUrl, envConfig.walletId)
    )
  } else {
    dependencyManager.registerInstance(
      InjectionSymbols.StorageService,
      new InternalWalletStorageService(envConfig.internalWalletSqlitePath)
    )
  }
}
