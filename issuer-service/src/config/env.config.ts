const env = process.env

/** Configuración del issuer (puertos, URLs de KMS/Storage/DID, feature flags). */
export const envConfig = {
  port: Number(env.PORT || 3000),
  serviceHost: env.SERVICE_HOST || 'localhost',
  agentLabel: env.AGENT_LABEL || 'Issuer',
  walletId: env.WALLET_ID || 'issuer-wallet',
  walletKey: env.WALLET_KEY || 'issuer-key',
  didcommEndpoint: env.DIDCOMM_ENDPOINT || 'http://localhost:3000',
  didcommPort: Number(env.DIDCOMM_PORT || 3001),
  /** Base para links de invitación. Default: didcomm:// (sin host, solo ?oob=...). */
  invitationUrlPrefix: env.INVITATION_URL_PREFIX || 'didcomm://',
  useRemoteKms: env.USE_REMOTE_KMS === 'true',
  remoteKmsUrl: env.REMOTE_KMS_URL || 'http://localhost:4001',
  useRemoteStorage: env.USE_REMOTE_STORAGE === 'true',
  remoteStorageUrl: env.REMOTE_STORAGE_URL || 'http://localhost:4002',
  didServiceUrl: env.DID_SERVICE_URL || 'http://localhost:4003',
}
