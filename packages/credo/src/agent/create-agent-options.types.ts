import type { CredoLogger } from '../types/logger.types'

/**
 * Opciones base para crear un agente Credo.
 */
export interface CreateAgentOptions {
  wsServer?: object
  transportCloseDelayMs?: number
  /** Logger para los listeners (p. ej. Nest Logger). Si no se pasa, usa console. */
  logger?: CredoLogger
}

/**
 * Opciones para createIssuerAgent.
 * Incluye getters para que los listeners obtengan issuerDid y statusList en runtime.
 */
export interface CreateIssuerAgentOptions extends CreateAgentOptions {
  /** Obtener DID del issuer (seteado tras bootstrap) */
  getIssuerDid: () => string
  /** Obtener StatusList (seteada tras ensureStatusList) */
  getStatusList: () => { id: string }
  /** Indica si hay StatusList configurada */
  hasStatusList: () => boolean
}

/**
 * Opciones para createHolderAgent.
 */
export interface CreateHolderAgentOptions extends CreateAgentOptions {
  label?: string
}

/**
 * Opciones para createVerifierAgent.
 */
export interface CreateVerifierAgentOptions extends CreateAgentOptions {
  label?: string
}
