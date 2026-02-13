import { Injectable } from '@nestjs/common'
import { openKmsDb } from './db'
import { generateKeyPairSync, randomBytes } from 'crypto'

/**
 * Servicio de gestión de claves.
 *
 * Crea pares Ed25519, importa claves JWK, persiste en SQLite.
 * Los agentes Credo lo usan vía RemoteKeyManagementService.
 */
@Injectable()
export class KmsService {
  private dbPromise = openKmsDb(process.env.KMS_SQLITE_PATH)

  /** Crea par Ed25519, persiste en DB. Retorna keyId y publicJwk. */
  async createKey(keyId?: string) {
    const id = keyId || require('crypto').randomUUID()
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const publicJwk = publicKey.export({ format: 'jwk' })
    const privateJwk = privateKey.export({ format: 'jwk' })
    publicJwk.kid = id
    privateJwk.kid = id
    const db = await this.dbPromise
    await db.run('INSERT OR REPLACE INTO keys (id, publicJwk, privateJwk) VALUES (?, ?, ?)', [
      id,
      JSON.stringify(publicJwk),
      JSON.stringify(privateJwk),
    ])
    return { keyId: id, publicJwk }
  }

  /** Obtiene la clave pública (JWK) por keyId. Retorna null si no existe. */
  async getPublicKey(id: string) {
    const db = await this.dbPromise
    const row = await db.get('SELECT publicJwk FROM keys WHERE id = ?', [id])
    return row ? JSON.parse(row.publicJwk) : null
  }

  /** Importa clave privada JWK. Deriva publicJwk eliminando 'd'. */
  async importKey(privateJwk: any) {
    const kid = privateJwk.kid || require('crypto').randomUUID()
    const publicJwk = Object.assign({}, privateJwk)
    delete publicJwk.d
    publicJwk.kid = kid
    const db = await this.dbPromise
    await db.run('INSERT OR REPLACE INTO keys (id, publicJwk, privateJwk) VALUES (?, ?, ?)', [kid, JSON.stringify(publicJwk), JSON.stringify(privateJwk)])
    return { keyId: kid, publicJwk }
  }

  /** Elimina clave por keyId. */
  async deleteKey(id: string) {
    const db = await this.dbPromise
    await db.run('DELETE FROM keys WHERE id = ?', [id])
    return true
  }

  /** Genera bytes aleatorios para nonces, etc. */
  random(len = 32) {
    return randomBytes(len)
  }

  async encrypt(data: any) {
    return { encrypted: data, iv: null, tag: null }
  }

  async decrypt(encrypted: any) {
    return { data: encrypted }
  }
}

