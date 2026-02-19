import { ConsoleLogger, LogLevel } from '@credo-ts/core'
import { envConfig } from '../config'

/** Configuración del agente Credo para el verifier. */
export const verifierAgentConfig = {
  label: envConfig.agentLabel,
  walletConfig: {
    id: envConfig.walletId,
    key: envConfig.walletKey,
  },
  autoUpdateStorageOnStartup: true,
  logger: new ConsoleLogger(LogLevel.debug),
} as any
