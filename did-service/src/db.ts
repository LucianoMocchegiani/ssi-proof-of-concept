import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'

/**
 * Abre SQLite del DID service.
 *
 * Tabla documents(id, document). id = did (ej. did:custom:xxx).
 * Default: ./data/did.sqlite
 */
export async function openDidDb(dbPath?: string) {
  const file = dbPath ?? path.resolve(process.cwd(), 'data', 'did.sqlite')
  const dir = path.dirname(file)
  try {
    await import('fs').then(fs => fs.mkdirSync(dir, { recursive: true }))
  } catch (e) {}

  const db = await open({
    filename: file,
    driver: sqlite3.Database,
  })

  await db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      document TEXT NOT NULL
    );
  `)

  return db
}
