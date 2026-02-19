const env = process.env

/** Configuración del issuer (puertos, URLs de KMS/Storage/DID, feature flags). */
export const envConfig = {
  port: Number(env.PORT || 3000),
  serviceHost: env.SERVICE_HOST || 'localhost',
  agentLabel: env.AGENT_LABEL || 'Issuer',
  walletId: env.WALLET_ID || 'issuer-wallet',
  walletKey: env.WALLET_KEY || 'issuer-key',
  didcommEndpoint: env.DIDCOMM_ENDPOINT || 'ws://localhost:3000',
  didcommPort: Number(env.DIDCOMM_PORT || 3000),
  /** Base para links de invitación. Default: didcomm:// (sin host, solo ?oob=...). */
  invitationUrlPrefix: env.INVITATION_URL_PREFIX || 'didcomm://',
  kmsMode: (env.KMS_MODE || 'internal') as 'internal' | 'external',
  externalKmsUrl: env.EXTERNAL_KMS_URL || 'http://localhost:4001',
  internalKmsSqlitePath: env.INTERNAL_KMS_SQLITE_PATH || '/app/data/internal-kms.sqlite',
  walletMode: (env.WALLET_MODE || 'internal') as 'internal' | 'external',
  externalWalletUrl: env.EXTERNAL_WALLET_URL || 'http://localhost:4002',
  internalWalletSqlitePath: env.INTERNAL_WALLET_SQLITE_PATH || '/app/data/internal-wallet.sqlite',
  vdrServiceUrl: env.VDR_SERVICE_URL || 'http://localhost:4003',
}
