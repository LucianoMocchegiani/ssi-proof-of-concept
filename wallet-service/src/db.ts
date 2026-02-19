import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'

/**
 * Abre SQLite del wallet-service.
 *
 * Tabla records(type, id, data) con PRIMARY KEY (type, id).
 * Default: ./data/wallet.sqlite
 */
export async function openStorageDb(dbPath?: string) {
  const file = dbPath ?? path.resolve(process.cwd(), 'data', 'wallet.sqlite')
  const dir = path.dirname(file)
  try {
    await import('fs').then(fs => fs.mkdirSync(dir, { recursive: true }))
  } catch (e) {}

  const db = await open({
    filename: file,
    driver: sqlite3.Database,
  })

  await db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      type TEXT,
      id TEXT,
      data TEXT,
      PRIMARY KEY(type, id)
    );
  `)

  return db
}

