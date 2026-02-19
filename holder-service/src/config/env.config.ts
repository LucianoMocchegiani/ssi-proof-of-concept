const env = process.env

/** Configuración del holder. */
export const envConfig = {
  port: Number(env.PORT || 9005),
  serviceHost: env.SERVICE_HOST || 'localhost',
  agentLabel: env.AGENT_LABEL || 'Holder',
  walletId: env.WALLET_ID || 'holder-wallet',
  walletKey: env.WALLET_KEY || 'holderkey000000000000000000000',
  didcommEndpoint: env.DIDCOMM_ENDPOINT || 'ws://localhost:9005',
  didcommPort: Number(env.DIDCOMM_PORT || 9005),
  kmsMode: (env.KMS_MODE || 'internal') as 'internal' | 'external',
  externalKmsUrl: env.EXTERNAL_KMS_URL || 'http://localhost:4001',
  internalKmsSqlitePath: env.INTERNAL_KMS_SQLITE_PATH || '/app/data/internal-kms.sqlite',
  useRemoteStorage: env.USE_REMOTE_STORAGE === 'true',
  remoteStorageUrl: env.REMOTE_STORAGE_URL || 'http://localhost:4002',
  vdrServiceUrl: env.VDR_SERVICE_URL || 'http://localhost:4003',
}
