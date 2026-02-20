import { Injectable } from '@nestjs/common'
import { openStorageDb } from './db'
import type { RecordData, RecordItem, SaveResult, OkResult } from './types/record.types'

interface RawRow {
  id: string
  data: string
}

@Injectable()
export class StorageService {
  private dbPromise = openStorageDb(process.env.WALLET_SQLITE_PATH)

  async save(type: string, id: string | undefined, data: RecordData): Promise<SaveResult> {
    const db = await this.dbPromise
    const keyId = id || require('crypto').randomUUID()
    await db.run(
      'INSERT OR REPLACE INTO records (type, id, data) VALUES (?, ?, ?)',
      [type, keyId, JSON.stringify(data)],
    )
    return { id: keyId }
  }

  async getById(type: string, id: string): Promise<RecordData | null> {
    const db = await this.dbPromise
    const row = await db.get('SELECT data FROM records WHERE type = ? AND id = ?', [type, id]) as { data: string } | undefined
    return row ? JSON.parse(row.data) as RecordData : null
  }

  async getAll(type: string): Promise<RecordItem[]> {
    const db = await this.dbPromise
    const rows = await db.all('SELECT id, data FROM records WHERE type = ?', [type]) as RawRow[]
    return rows.map((r) => ({ id: r.id, data: JSON.parse(r.data) as RecordData }))
  }

  async getIdsByType(type: string): Promise<string[]> {
    const db = await this.dbPromise
    const rows = await db.all('SELECT id FROM records WHERE type = ?', [type]) as Array<{ id: string }>
    return rows.map((r) => r.id)
  }

  async update(type: string, id: string, data: RecordData): Promise<OkResult> {
    const db = await this.dbPromise
    await db.run(
      'UPDATE records SET data = ? WHERE type = ? AND id = ?',
      [JSON.stringify(data), type, id],
    )
    return { ok: true }
  }

  async delete(type: string, id: string): Promise<OkResult> {
    const db = await this.dbPromise
    await db.run('DELETE FROM records WHERE type = ? AND id = ?', [type, id])
    return { ok: true }
  }

  async query(type: string): Promise<RecordItem[]> {
    return this.getAll(type)
  }
}
