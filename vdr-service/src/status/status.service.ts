import { Injectable } from '@nestjs/common'
import { openDidDb } from '../db'
import { randomUUID } from 'crypto'
import { gzip, gunzip } from 'zlib'
import { promisify } from 'util'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

/** Tamanio por defecto del bitstring (cantidad de bits = indices posibles). */
const DEFAULT_LIST_SIZE = 65536

/**
 * Servicio de StatusList (Bitstring Status List 2021).
 *
 * Gestiona listas de estado para revocacion de credenciales W3C.
 * encoded_list: base64 de gzip(bitstring). Bit 0 = activo, 1 = revocado.
 */
@Injectable()
export class StatusService {
  private dbPromise = openDidDb(process.env.VDR_SQLITE_PATH)

  /**
   * Crea una nueva StatusList para un issuer.
   * Retorna id y URL base para credentialStatus.
   */
  async createList(issuerId: string): Promise<{ id: string; url: string }> {
    const id = randomUUID()
    const size = DEFAULT_LIST_SIZE
    const bitstring = Buffer.alloc(Math.ceil(size / 8), 0)
    const compressed = await gzipAsync(bitstring)
    const encodedList = compressed.toString('base64')

    const db = await this.dbPromise
    const now = Date.now()
    await db.run(
      'INSERT INTO status_lists (id, issuer_id, purpose, encoded_list, size, next_index, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
      [id, issuerId, 'revocation', encodedList, size, now]
    )

    const baseUrl = process.env.VDR_SERVICE_URL || process.env.STATUS_LIST_BASE_URL || 'http://localhost:4003'
    const url = `${baseUrl.replace(/\/$/, '')}/status/list/${id}`
    return { id, url }
  }

  /**
   * Obtiene la StatusList por id.
   * Retorna el encoded_list (base64 gzip) para que el verifier verifique el bit.
   */
  async getList(id: string): Promise<{ encodedList: string; size: number } | null> {
    const db = await this.dbPromise
    const row = await db.get('SELECT encoded_list, size FROM status_lists WHERE id = ?', [id])
    if (!row) return null
    return {
      encodedList: (row as any).encoded_list,
      size: (row as any).size,
    }
  }

  /**
   * Marca un indice como revocado (bit = 1).
   */
  async revoke(id: string, statusListIndex: number): Promise<void> {
    const db = await this.dbPromise
    const row = await db.get('SELECT encoded_list, size FROM status_lists WHERE id = ?', [id])
    if (!row) throw new Error('StatusList not found')

    const encodedList = (row as any).encoded_list
    const size = (row as any).size

    if (statusListIndex < 0 || statusListIndex >= size) {
      throw new Error(`statusListIndex ${statusListIndex} out of range [0, ${size})`)
    }

    const compressed = Buffer.from(encodedList, 'base64')
    const bitstring = await gunzipAsync(compressed)
    const byteIndex = Math.floor(statusListIndex / 8)
    const bitIndex = statusListIndex % 8
    bitstring[byteIndex] |= 1 << bitIndex

    const newCompressed = await gzipAsync(bitstring)
    const newEncodedList = newCompressed.toString('base64')

    await db.run('UPDATE status_lists SET encoded_list = ?, updated_at = ? WHERE id = ?', [
      newEncodedList,
      Date.now(),
      id,
    ])
  }

  /**
   * Verifica si un indice esta revocado (bit = 1).
   */
  async isRevoked(id: string, statusListIndex: number): Promise<boolean> {
    const list = await this.getList(id)
    if (!list) return true // desconocido = rechazar

    const compressed = Buffer.from(list.encodedList, 'base64')
    const bitstring = await gunzipAsync(compressed)
    const byteIndex = Math.floor(statusListIndex / 8)
    const bitIndex = statusListIndex % 8
    return (bitstring[byteIndex] & (1 << bitIndex)) !== 0
  }

  /**
   * Asigna el siguiente indice para una credencial (para usar al emitir).
   * Incrementa next_index y retorna el valor asignado.
   */
  async allocateIndex(id: string): Promise<number> {
    const db = await this.dbPromise
    const row = await db.get('SELECT size, next_index FROM status_lists WHERE id = ?', [id])
    if (!row) throw new Error('StatusList not found')
    const size = (row as any).size
    const nextIndex = (row as any).next_index
    if (nextIndex >= size) throw new Error('StatusList full')

    await db.run('UPDATE status_lists SET next_index = next_index + 1, updated_at = ? WHERE id = ?', [
      Date.now(),
      id,
    ])
    return nextIndex
  }
}
