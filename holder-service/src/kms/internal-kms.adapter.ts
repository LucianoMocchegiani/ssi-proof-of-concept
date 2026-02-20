import { AgentContext, Kms, utils } from '@credo-ts/core'
import type { Uint8ArrayBuffer } from '@credo-ts/core'
import { randomBytes, generateKeyPairSync, createPrivateKey, sign, createCipheriv, createDecipheriv } from 'crypto'
import nacl from 'tweetnacl'
import * as ed2curve from 'ed2curve'
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

  private ed25519ToX25519Secret(keyId: string): Uint8Array {
    const entry = this.getKey(keyId)
    if (!entry) throw new Kms.KeyManagementError(`Key ${keyId} not found`)
    const ed25519Secret = Buffer.concat([
      Buffer.from(entry.privateJwk.d, 'base64url'),
      Buffer.from(entry.publicJwk.x, 'base64url'),
    ])
    if (ed25519Secret.length !== 64) throw new Kms.KeyManagementError('Invalid Ed25519 key format (expected 64 bytes)')
    const x25519Secret = ed2curve.convertSecretKey(new Uint8Array(ed25519Secret))
    if (!x25519Secret) throw new Kms.KeyManagementError('Failed to convert Ed25519 to X25519')
    return x25519Secret
  }

  public async encrypt(_agentContext: AgentContext, _options: Kms.KmsEncryptOptions): Promise<Kms.KmsEncryptReturn> {
    const opts = _options as any
    if (opts.data === undefined && opts.plaintext !== undefined) opts.data = opts.plaintext
    const data = _options.data instanceof Uint8Array ? _options.data : Uint8Array.from(Buffer.from(_options.data as any))

    const key = opts.key
    if (key?.keyAgreement) {
      const ka = key.keyAgreement
      const keyId = ka.keyId ?? ka.senderKeyId
      const externalPublicJwk = ka.externalPublicJwk ?? ka.recipientPublicKey ?? ka.recipientKey
      if (!externalPublicJwk?.x) throw new Kms.KeyManagementError('encrypt: keyAgreement.externalPublicJwk required')
      const theirX25519Pub = Buffer.from(externalPublicJwk.x, 'base64url')
      if (theirX25519Pub.length !== 32) throw new Kms.KeyManagementError('encrypt: externalPublicJwk.x must be 32 bytes')

      let x25519Secret: Uint8Array
      let ephemeralPub: Buffer | undefined

      if (keyId) {
        x25519Secret = this.ed25519ToX25519Secret(keyId)
      } else {
        const ephemeral = nacl.box.keyPair()
        x25519Secret = ephemeral.secretKey
        ephemeralPub = Buffer.from(ephemeral.publicKey)
      }

      const nonce = randomBytes(24)
      const boxed = nacl.box(new Uint8Array(data), new Uint8Array(nonce), new Uint8Array(theirX25519Pub), x25519Secret)
      if (!boxed) throw new Kms.KeyManagementError('encrypt: nacl.box failed')

      if (ephemeralPub) {
        const encrypted = Buffer.concat([ephemeralPub, nonce, Buffer.from(boxed)])
        return { encrypted: encrypted as unknown as Uint8ArrayBuffer, iv: undefined as any, tag: undefined as any }
      }
      return {
        encrypted: Buffer.from(boxed) as unknown as Uint8ArrayBuffer,
        iv: nonce as unknown as Uint8ArrayBuffer,
        tag: undefined as any,
      }
    }

    if (key?.privateJwk?.kty === 'oct') {
      const symKey = Buffer.from(key.privateJwk.k, 'base64url')
      if (symKey.length !== 32) throw new Kms.KeyManagementError('encrypt: symmetric key must be 32 bytes')
      const iv = randomBytes(12)
      const encOpts = opts.encryption || {}
      const aad = encOpts.aad ? (typeof encOpts.aad === 'string' ? Buffer.from(encOpts.aad, 'base64') : Buffer.from(encOpts.aad)) : undefined
      const cipher = createCipheriv('chacha20-poly1305', symKey, iv, { authTagLength: 16 } as any)
      if (aad) (cipher as any).setAAD(aad)
      const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
      const tag = (cipher as any).getAuthTag() as Buffer
      return {
        encrypted: encrypted as unknown as Uint8ArrayBuffer,
        iv: iv as unknown as Uint8ArrayBuffer,
        tag: tag as unknown as Uint8ArrayBuffer,
      }
    }

    throw new Kms.KeyManagementError('encrypt: key.keyAgreement or key.privateJwk (oct) required')
  }

  public async decrypt(_agentContext: AgentContext, _options: Kms.KmsDecryptOptions): Promise<Kms.KmsDecryptReturn> {
    const opts = _options as any
    const encrypted = opts.encrypted instanceof Uint8Array ? opts.encrypted : Uint8Array.from(Buffer.from(opts.encrypted as any))
    const dec = opts.decryption ?? {}

    const key = opts.key
    if (key?.keyAgreement) {
      const ka = key.keyAgreement
      const keyId = ka.keyId
      if (!keyId) throw new Kms.KeyManagementError('decrypt: keyAgreement.keyId required')
      const x25519Secret = this.ed25519ToX25519Secret(keyId)
      const externalPublicJwk = ka.externalPublicJwk

      const iv = dec.iv instanceof Uint8Array ? Buffer.from(dec.iv) : (typeof dec.iv === 'string' ? Buffer.from(dec.iv, 'base64') : null)

      if (externalPublicJwk?.x && iv && iv.length === 24) {
        const theirX25519Pub = Buffer.from(externalPublicJwk.x, 'base64url')
        const opened = nacl.box.open(new Uint8Array(encrypted), new Uint8Array(iv), new Uint8Array(theirX25519Pub), x25519Secret)
        if (!opened) throw new Kms.KeyManagementError('decrypt: nacl.box.open failed (authcrypt)')
        return { data: Buffer.from(opened) as unknown as Uint8ArrayBuffer }
      }

      if (encrypted.length <= 56) throw new Kms.KeyManagementError('decrypt: encrypted too short for anoncrypt (need 32+24+data)')
      const ephemeralPub = encrypted.subarray(0, 32)
      const extractedNonce = encrypted.subarray(32, 56)
      const boxed = encrypted.subarray(56)
      const opened = nacl.box.open(new Uint8Array(boxed), new Uint8Array(extractedNonce), new Uint8Array(ephemeralPub), x25519Secret)
      if (!opened) throw new Kms.KeyManagementError('decrypt: nacl.box.open failed (anoncrypt)')
      return { data: Buffer.from(opened) as unknown as Uint8ArrayBuffer }
    }

    if (key?.privateJwk?.kty === 'oct') {
      const symKey = Buffer.from(key.privateJwk.k, 'base64url')
      const iv = dec.iv instanceof Uint8Array ? Buffer.from(dec.iv) : (typeof dec.iv === 'string' ? Buffer.from(dec.iv, 'base64') : null)
      if (!iv || iv.length !== 12) throw new Kms.KeyManagementError('decrypt: iv (12 bytes) required for symmetric')
      const tag = dec.tag instanceof Uint8Array ? Buffer.from(dec.tag) : (typeof dec.tag === 'string' ? Buffer.from(dec.tag, 'base64') : null)
      const aad = dec.aad instanceof Uint8Array ? Buffer.from(dec.aad) : (typeof dec.aad === 'string' ? Buffer.from(dec.aad) : undefined)
      const decipher = createDecipheriv('chacha20-poly1305', symKey, iv, { authTagLength: 16 } as any)
      if (aad) (decipher as any).setAAD(aad)
      if (tag) decipher.setAuthTag(tag)
      const data = Buffer.concat([decipher.update(encrypted), decipher.final()])
      return { data: data as unknown as Uint8ArrayBuffer }
    }

    throw new Kms.KeyManagementError('decrypt: key.keyAgreement or key.privateJwk (oct) required')
  }

  public randomBytes(_agentContext: AgentContext, options: Kms.KmsRandomBytesOptions) {
    return randomBytes(options.length)
  }
}
