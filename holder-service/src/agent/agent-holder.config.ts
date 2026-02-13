import { envConfig } from '../config'

/** Configuración del agente Credo para el holder. */
export const holderAgentConfig = {
  label: envConfig.agentLabel,
  walletConfig: {
    id: envConfig.walletId,
    key: envConfig.walletKey,
  },
  autoUpdateStorageOnStartup: true,
} as any
