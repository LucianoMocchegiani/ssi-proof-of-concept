/**
 * Configuración del VDR (registro de DIDs).
 */
export interface VdrConfig {
  vdrServiceUrl: string
}

/**
 * Configuración del wallet (almacenamiento de registros Credo).
 */
export interface WalletConfig {
  mode: 'internal' | 'external'
  /**
   * Cuando mode=internal: ruta o connection string para el backend de persistencia.
   * - Path a archivo: `./data/wallet.sqlite` (SQLite, comportamiento actual)
   * - Connection string: `postgresql://host/db` (futuro)
   * - Memoria: `memory:` (futuro, datos volátiles)
   * Si no se especifica, el adapter puede usar un valor por defecto (ej. ./data/internal-wallet.sqlite).
   */
  connection?: string
  /** URL del wallet-service cuando mode=external */
  externalUrl?: string
  /** Identificador del wallet cuando mode=external */
  walletId?: string
}

/**
 * Configuración del KMS (gestión de claves).
 */
export interface KmsConfig {
  mode: 'internal' | 'external'
  /**
   * Cuando mode=internal: ruta o connection string para el backend de persistencia.
   * - Path a archivo: `./data/kms.sqlite` (SQLite, comportamiento actual)
   * - Connection string: `postgresql://host/db` (futuro)
   * - Memoria: `memory:` (futuro, claves volátiles)
   * Si no se especifica, el adapter puede usar un valor por defecto (ej. ./data/internal-kms.sqlite).
   */
  connection?: string
  /** URL del kms-service cuando mode=external */
  externalUrl?: string
}

/**
 * Configuración base para cualquier agente Credo (issuer, holder, verifier).
 */
export interface CredoAgentBaseConfig {
  label: string
  vdrServiceUrl: string
  didcommEndpoint: string
  /** Puerto para DIDComm WebSocket cuando no se usa wsServer compartido */
  didcommPort?: number
  /** Identificador del wallet para Credo (walletConfig.id) */
  walletId: string
  /** Clave de cifrado del wallet para Credo (walletConfig.key) */
  walletKey: string
  wallet: WalletConfig
  kms: KmsConfig
}
