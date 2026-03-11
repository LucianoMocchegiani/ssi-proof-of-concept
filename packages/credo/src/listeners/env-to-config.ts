import type { CredoAgentBaseConfig } from '../types/config.types'

/** Env vars necesarios para construir CredoAgentBaseConfig. */
export interface CredoEnvConfig {
  agentLabel: string
  vdrServiceUrl: string
  didcommEndpoint: string
  didcommPort?: number
  walletId: string
  walletKey: string
  walletMode: 'internal' | 'external'
  internalWalletSqlitePath?: string
  externalWalletUrl?: string
  kmsMode: 'internal' | 'external'
  internalKmsSqlitePath?: string
  externalKmsUrl?: string
}

export function buildCredoConfigFromEnv(env: CredoEnvConfig): CredoAgentBaseConfig {
  return {
    label: env.agentLabel,
    vdrServiceUrl: env.vdrServiceUrl,
    didcommEndpoint: env.didcommEndpoint,
    didcommPort: env.didcommPort,
    walletId: env.walletId,
    walletKey: env.walletKey,
    wallet: {
      mode: env.walletMode,
      connection: env.internalWalletSqlitePath,
      externalUrl: env.externalWalletUrl,
      walletId: env.walletId,
    },
    kms: {
      mode: env.kmsMode,
      connection: env.internalKmsSqlitePath,
      externalUrl: env.externalKmsUrl,
    },
  }
}
