import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'

/**
 * Abre SQLite del VDR service.
 *
 * Tabla documents(id, document). id = did (ej. did:custom:xxx).
 * Default: ./data/vdr.sqlite
 */
export async function openDidDb(dbPath?: string) {
  const file = dbPath ?? path.resolve(process.cwd(), 'data', 'vdr.sqlite')
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
    CREATE TABLE IF NOT EXISTS status_lists (
      id TEXT PRIMARY KEY,
      issuer_id TEXT NOT NULL,
      purpose TEXT DEFAULT 'revocation',
      encoded_list TEXT NOT NULL,
      size INTEGER DEFAULT 65536,
      next_index INTEGER DEFAULT 0,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS credential_status_map (
      credential_id TEXT PRIMARY KEY,
      status_list_id TEXT NOT NULL,
      status_list_index INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  return db
}
