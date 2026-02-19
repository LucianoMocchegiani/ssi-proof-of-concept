import { Injectable } from '@nestjs/common'
import { openStorageDb } from './db'

/**
 * Servicio de persistencia de registros del wallet-service.
 *
 * Tabla records(type, id, data). Los agentes Credo usan ExternalWalletStorageService
 * que traduce save/update con toJSON y getById/getAll con fromJSON.
 */
@Injectable()
export class StorageService {
  private dbPromise = openStorageDb(process.env.WALLET_SQLITE_PATH)

  /** Inserta o reemplaza. keyId = id o UUID. Retorna { id }. */
  async save(type: string, id: string | undefined, data: any) {
    const db = await this.dbPromise
    const keyId = id || require('crypto').randomUUID()
    await db.run('INSERT OR REPLACE INTO records (type, id, data) VALUES (?, ?, ?)', [type, keyId, JSON.stringify(data)])
    return { id: keyId }
  }

  /** Retorna data parseada o null si no existe. */
  async getById(type: string, id: string) {
    const db = await this.dbPromise
    const row = await db.get('SELECT data FROM records WHERE type = ? AND id = ?', [type, id])
    return row ? JSON.parse(row.data) : null
  }

  /** Lista registros por type. Retorna [{ id, data }]. */
  async getAll(type: string) {
    const db = await this.dbPromise
    const rows = await db.all('SELECT id, data FROM records WHERE type = ?', [type])
    return rows.map((r: any) => ({ id: r.id, data: JSON.parse(r.data) }))
  }

  /** Lista solo los ids de un type (para debug). */
  async getIdsByType(type: string): Promise<string[]> {
    const db = await this.dbPromise
    const rows = await db.all('SELECT id FROM records WHERE type = ?', [type])
    return rows.map((r: any) => r.id)
  }

  /** Actualiza data de un registro existente. */
  async update(type: string, id: string, data: any) {
    const db = await this.dbPromise
    await db.run('UPDATE records SET data = ? WHERE type = ? AND id = ?', [JSON.stringify(data), type, id])
    return { ok: true }
  }

  /** Elimina un registro por type e id. */
  async delete(type: string, id: string) {
    const db = await this.dbPromise
    await db.run('DELETE FROM records WHERE type = ? AND id = ?', [type, id])
    return { ok: true }
  }

  /** Query por type. Actualmente delega en getAll. */
  async query(type: string) {
    return this.getAll(type)
  }
}

