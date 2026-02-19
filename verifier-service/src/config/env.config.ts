const env = process.env

/** Configuración del verifier. */
export const envConfig = {
  port: Number(env.PORT || 9004),
  serviceHost: env.SERVICE_HOST || 'localhost',
  agentLabel: env.AGENT_LABEL || 'Verifier',
  walletId: env.WALLET_ID || 'verifier-wallet',
  walletKey: env.WALLET_KEY || 'verifierkey000000000000000000000',
  didcommEndpoint: env.DIDCOMM_ENDPOINT || 'ws://localhost:9004',
  didcommPort: Number(env.DIDCOMM_PORT || 9004),
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
