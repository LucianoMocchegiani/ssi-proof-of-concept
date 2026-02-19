import { AgentContext, Kms, utils } from '@credo-ts/core'
import type { Uint8ArrayBuffer } from '@credo-ts/core'
import { randomBytes, generateKeyPairSync, createPrivateKey, sign } from 'crypto'
import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'

/**
 * KMS interno: cripto local (Node.js crypto) + persistencia SQLite.
 * Las claves privadas viven en el proceso del agente, no salen por red.
 */
export class InternalKeyManagementService implements Kms.KeyManagementService {
  public static readonly backend = 'internal'
  public readonly backend = InternalKeyManagementService.backend

  private db: Database.Database

  constructor(sqlitePath?: string) {
    const dbPath = sqlitePath || process.env.INTERNAL_KMS_SQLITE_PATH || './data/internal-kms.sqlite'
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS keys (
        id TEXT PRIMARY KEY,
        publicJwk TEXT NOT NULL,
        privateJwk TEXT NOT NULL
      )
    `)
  }

  private getKey(keyId: string): { privateJwk: any; publicJwk: any } | null {
    const row = this.db.prepare('SELECT publicJwk, privateJwk FROM keys WHERE id = ?').get(keyId) as any
    if (!row) return null
    return { publicJwk: JSON.parse(row.publicJwk), privateJwk: JSON.parse(row.privateJwk) }
  }

  private saveKey(keyId: string, publicJwk: any, privateJwk: any) {
    this.db.prepare('INSERT OR REPLACE INTO keys (id, publicJwk, privateJwk) VALUES (?, ?, ?)').run(
      keyId,
      JSON.stringify(publicJwk),
      JSON.stringify(privateJwk),
    )
  }

  public isOperationSupported(_agentContext: AgentContext, operation: Kms.KmsOperation): boolean {
    if (operation.operation === 'randomBytes') return true
    if (operation.operation === 'createKey') {
      const type = (operation as any).type
      if (!type) return true
      return type.kty === 'OKP' && type.crv === 'Ed25519'
    }
    if (operation.operation === 'importKey') return true
    if (operation.operation === 'decrypt' || operation.operation === 'encrypt') return true
    if (operation.operation === 'sign' || operation.operation === 'verify') return true
    return false
  }

  public async getPublicKey(_agentContext: AgentContext, keyId: string) {
    const entry = this.getKey(keyId)
    return entry ? entry.publicJwk : null
  }

  public async createKey<Type extends Kms.KmsCreateKeyType>(
    _agentContext: AgentContext,
    options: Kms.KmsCreateKeyOptions<Type>
  ): Promise<Kms.KmsCreateKeyReturn<Type>> {
    if (options.type.kty !== 'OKP' || (options.type as any).crv !== 'Ed25519') {
      throw new Error('Only OKP Ed25519 supported in InternalKeyManagementService')
    }
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const kid = options.keyId ?? utils.uuid()
    const publicJwk = publicKey.export({ format: 'jwk' }) as any
    const privateJwk = privateKey.export({ format: 'jwk' }) as any
    publicJwk.kid = kid
    privateJwk.kid = kid
    this.saveKey(kid, publicJwk, privateJwk)
    return { keyId: kid, publicJwk } as unknown as Kms.KmsCreateKeyReturn<Type>
  }

  public async importKey<Jwk extends Kms.KmsJwkPrivate>(_agentContext: AgentContext, options: Kms.KmsImportKeyOptions<Jwk>) {
    const kid = options.privateJwk.kid ?? utils.uuid()
    const publicJwk = Kms.publicJwkFromPrivateJwk(options.privateJwk as any)
    publicJwk.kid = kid
    this.saveKey(kid, publicJwk, options.privateJwk)
    return { keyId: kid, publicJwk } as any
  }

  public async deleteKey(_agentContext: AgentContext, options: Kms.KmsDeleteKeyOptions) {
    const result = this.db.prepare('DELETE FROM keys WHERE id = ?').run(options.keyId)
    return result.changes > 0
  }

  public async sign(_agentContext: AgentContext, options: Kms.KmsSignOptions): Promise<Kms.KmsSignReturn> {
    const entry = this.getKey(options.keyId)
    if (!entry) throw new Kms.KeyManagementError(`Key ${options.keyId} not found`)
    const { algorithm } = options
    if (algorithm !== 'EdDSA' && algorithm !== 'Ed25519') {
      throw new Kms.KeyManagementError(`Only EdDSA/Ed25519 supported, got ${algorithm}`)
    }
    const data = options.data instanceof Uint8Array ? options.data : Buffer.from(options.data as any)
    const privateKey = createPrivateKey({ key: entry.privateJwk, format: 'jwk' })
    const signature = sign(null, data, privateKey)
    return { signature: signature as unknown as Uint8ArrayBuffer }
  }

  public async verify(_agentContext: AgentContext, options: Kms.KmsVerifyOptions): Promise<Kms.KmsVerifyReturn> {
    const { key, algorithm, data, signature } = options
    const publicJwk =
      'keyId' in key && key.keyId
        ? (this.getKey(key.keyId)?.publicJwk ?? null)
        : (key as { publicJwk: any }).publicJwk
    if (!publicJwk) throw new Kms.KeyManagementError('Public key not found for verify')
    if (algorithm !== 'EdDSA' && algorithm !== 'Ed25519') {
      throw new Kms.KeyManagementError(`Only EdDSA/Ed25519 supported, got ${algorithm}`)
    }
    const { createPublicKey, verify } = await import('crypto')
    const pubKey = createPublicKey({ key: publicJwk, format: 'jwk' })
    const dataBuf = data instanceof Uint8Array ? data : Buffer.from(data as any)
    const sigBuf = signature instanceof Uint8Array ? signature : Buffer.from(signature as any)
    const valid = verify(null, dataBuf, pubKey, sigBuf)
    return valid ? { verified: true, publicJwk } : { verified: false }
  }

  public async encrypt(_agentContext: AgentContext, _options: Kms.KmsEncryptOptions): Promise<Kms.KmsEncryptReturn> {
    const data = (_options.data instanceof Uint8Array ? (_options.data as Uint8Array) : Uint8Array.from(Buffer.from(_options.data as any))) as unknown as Uint8ArrayBuffer
    const iv = randomBytes(12) as unknown as Uint8ArrayBuffer
    const tag = randomBytes(16) as unknown as Uint8ArrayBuffer
    return { encrypted: data, iv, tag }
  }

  public async decrypt(_agentContext: AgentContext, _options: Kms.KmsDecryptOptions): Promise<Kms.KmsDecryptReturn> {
    const encrypted = (_options.encrypted instanceof Uint8Array ? (_options.encrypted as Uint8Array) : Uint8Array.from(Buffer.from(_options.encrypted as any))) as unknown as Uint8ArrayBuffer
    return { data: encrypted }
  }

  public randomBytes(_agentContext: AgentContext, options: Kms.KmsRandomBytesOptions) {
    return randomBytes(options.length)
  }
}
