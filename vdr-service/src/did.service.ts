import { Injectable } from '@nestjs/common'
import { openDidDb } from './db'

/**
 * Servicio de DID Documents.
 *
 * Persiste documentos por id (ej. did:custom:uuid).
 * El documento incluye verificationMethod y service (DIDComm).
 */
@Injectable()
export class DidService {
  private dbPromise = openDidDb(process.env.VDR_SQLITE_PATH)

  /** Guarda o reemplaza un DID Document. */
  async save(id: string, document: object) {
    const db = await this.dbPromise
    await db.run('INSERT OR REPLACE INTO documents (id, document) VALUES (?, ?)', [
      id,
      JSON.stringify(document),
    ])
    return { id }
  }

  /** Obtiene DID Document por id. Null si no existe. */
  async getById(id: string) {
    const db = await this.dbPromise
    const row = await db.get('SELECT document FROM documents WHERE id = ?', [id])
    return row ? JSON.parse(row.document) : null
  }

  /** Elimina un DID Document. */
  async deleteById(id: string) {
    const db = await this.dbPromise
    await db.run('DELETE FROM documents WHERE id = ?', [id])
    return { deleted: id }
  }

  /** Lista todos los DIDs registrados. Opcionalmente filtra por prefijo. */
  async list(prefix?: string): Promise<{ id: string; document: object }[]> {
    const db = await this.dbPromise
    let rows: any[]
    if (prefix) {
      rows = await db.all('SELECT id, document FROM documents WHERE id LIKE ?', [`${prefix}%`])
    } else {
      rows = await db.all('SELECT id, document FROM documents')
    }
    return rows.map((r: any) => ({ id: r.id, document: JSON.parse(r.document) }))
  }
}
