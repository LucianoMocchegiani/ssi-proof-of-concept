import * as path from 'path'

/**
 * Resuelve connection a path para SQLite (wallet/KMS internos).
 * - "memory:" → ":memory:" (SQLite en RAM)
 * - path (ej. "./data/wallet.sqlite") → path absoluto/normalizado
 * - vacío/undefined → usa defaultPath
 *
 * Para postgresql:// o postgres:// lanza error (no implementado aún).
 */
export function resolveConnectionToPath(
  connection: string | undefined,
  defaultPath: string
): string {
  const c = connection?.trim()
  if (!c) return path.resolve(defaultPath)
  if (c === 'memory:') return ':memory:'
  if (c.startsWith('postgresql:') || c.startsWith('postgres:')) {
    throw new Error('PostgreSQL no soportado aún en adaptadores internos')
  }
  return path.resolve(c)
}
