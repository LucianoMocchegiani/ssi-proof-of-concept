/**
 * Logger compatible con Nest Logger y console.
 * Si no se pasa, se usa console por defecto.
 */
export interface CredoLogger {
  log(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

/** Logger por defecto que usa console. */
export const defaultLogger: CredoLogger = {
  log: (msg, ...args) => console.log(msg, ...args),
  warn: (msg, ...args) => console.warn(msg, ...args),
  error: (msg, ...args) => console.error(msg, ...args),
}

export function resolveLogger(logger?: CredoLogger): CredoLogger {
  return logger ?? defaultLogger
}
