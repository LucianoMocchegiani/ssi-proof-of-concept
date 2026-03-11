import { DependencyManager, InjectionSymbols } from '@credo-ts/core'
import { InternalWalletStorageService } from '../adapters/wallet/internal-wallet.adapter'
import { ExternalWalletStorageService } from '../adapters/wallet/external-wallet.adapter'
import type { WalletConfig } from '../types/config.types'

/**
 * Registra el adaptador de wallet en el DependencyManager del agente.
 */
export function registerWalletConfig(
  dependencyManager: DependencyManager,
  config: WalletConfig
): void {
  if (config.mode === 'external') {
    const url = config.externalUrl ?? ''
    const walletId = config.walletId ?? 'default'
    dependencyManager.registerInstance(
      InjectionSymbols.StorageService,
      new ExternalWalletStorageService(url, walletId)
    )
  } else {
    dependencyManager.registerInstance(
      InjectionSymbols.StorageService,
      new InternalWalletStorageService(config.connection)
    )
  }
}
