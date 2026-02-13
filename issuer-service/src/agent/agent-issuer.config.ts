import { envConfig } from '../config'

/** Configuración del agente Credo para el issuer. Incluye autoUpdateStorageOnStartup. */
export const issuerAgentConfig = {
  label: envConfig.agentLabel,
  walletConfig: {
    id: envConfig.walletId,
    key: envConfig.walletKey,
  },
  autoUpdateStorageOnStartup: true,
} as any
