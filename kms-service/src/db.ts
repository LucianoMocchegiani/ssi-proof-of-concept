import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'

/**
 * Abre la base SQLite del KMS.
 *
 * Crea la tabla keys (id, publicJwk, privateJwk) si no existe.
 * Default: ./data/kms.sqlite
 */
export async function openKmsDb(dbPath?: string) {
  const file = dbPath ?? path.resolve(process.cwd(), 'data', 'kms.sqlite')
  const dir = path.dirname(file)
  // Ensure directory exists (best-effort)
  try {
    await import('fs').then(fs => fs.mkdirSync(dir, { recursive: true }))
  } catch (e) {}

  const db = await open({
    filename: file,
    driver: sqlite3.Database,
  })

  await db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
      id TEXT PRIMARY KEY,
      publicJwk TEXT,
      privateJwk TEXT
    );
  `)

  return db
}

