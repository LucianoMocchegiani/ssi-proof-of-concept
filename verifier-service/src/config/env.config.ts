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
  useRemoteKms: env.USE_REMOTE_KMS === 'true',
  remoteKmsUrl: env.REMOTE_KMS_URL || 'http://localhost:4001',
  useRemoteStorage: env.USE_REMOTE_STORAGE === 'true',
  remoteStorageUrl: env.REMOTE_STORAGE_URL || 'http://localhost:4002',
  vdrServiceUrl: env.VDR_SERVICE_URL || 'http://localhost:4003',
}
