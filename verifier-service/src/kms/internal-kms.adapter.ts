import { AgentContext, Kms, utils } from '@credo-ts/core'
import type { Uint8ArrayBuffer } from '@credo-ts/core'
import { randomBytes, generateKeyPairSync, createPrivateKey, sign, createCipheriv, createDecipheriv, type JsonWebKey } from 'crypto'
import nacl from 'tweetnacl'
import * as ed2curve from 'ed2curve'
import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'

// ─── Tipos internos del adapter ─────────────────────────────────────

/** JWK público Ed25519 tal como lo persiste el KMS interno */
interface Ed25519PublicJwk {
  kty: 'OKP'
  crv: 'Ed25519'
  /** Clave pública en base64url (32 bytes) */
  x: string
  kid?: string
}

/** JWK privado Ed25519 (incluye seed 'd') */
interface Ed25519PrivateJwk extends Ed25519PublicJwk {
  /** Seed privado en base64url (32 bytes) */
  d: string
}

/** Par de claves almacenado en SQLite */
interface StoredKeyPair {
  publicJwk: Ed25519PublicJwk
  privateJwk: Ed25519PrivateJwk
}

/** Fila cruda de la tabla keys en SQLite (JSON strings) */
interface KeyRow {
  publicJwk: string
  privateJwk: string
}

/** JWK de clave simétrica para cifrado ChaCha20-Poly1305 */
interface SymmetricJwk {
  kty: 'oct'
  /** Material de clave en base64url (32 bytes) */
  k: string
}

/** Opciones de key agreement (propiedades que Credo pasa en encrypt/decrypt) */
interface KeyAgreementParams {
  keyId?: string
  senderKeyId?: string
  externalPublicJwk?: { x: string; [k: string]: unknown }
  recipientPublicKey?: { x: string; [k: string]: unknown }
  recipientKey?: { x: string; [k: string]: unknown }
}

/** Estructura de key para encrypt/decrypt (key agreement o simétrica) */
interface EncryptDecryptKey {
  keyAgreement?: KeyAgreementParams
  privateJwk?: SymmetricJwk
}

/** Opciones de cifrado simétrico (algorithm, aad) */
interface EncryptionOptions {
  algorithm?: string
  aad?: string | Uint8Array
}

/** Opciones de descifrado (iv, tag, aad, algorithm) */
interface DecryptionOptions {
  algorithm?: string
  iv?: Uint8Array | string
  tag?: Uint8Array | string
  aad?: Uint8Array | string
}

// ─── Adapter ────────────────────────────────────────────────────────

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

  private getKey(keyId: string): StoredKeyPair | null {
    const row = this.db.prepare('SELECT publicJwk, privateJwk FROM keys WHERE id = ?').get(keyId) as KeyRow | undefined
    if (!row) return null
    return {
      publicJwk: JSON.parse(row.publicJwk) as Ed25519PublicJwk,
      privateJwk: JSON.parse(row.privateJwk) as Ed25519PrivateJwk,
    }
  }

  private saveKey(keyId: string, publicJwk: Ed25519PublicJwk, privateJwk: Ed25519PrivateJwk): void {
    this.db.prepare('INSERT OR REPLACE INTO keys (id, publicJwk, privateJwk) VALUES (?, ?, ?)').run(
      keyId,
      JSON.stringify(publicJwk),
      JSON.stringify(privateJwk),
    )
  }

  public isOperationSupported(_agentContext: AgentContext, operation: Kms.KmsOperation): boolean {
    if (operation.operation === 'randomBytes') return true
    if (operation.operation === 'createKey') {
      // Credo no expone 'type' en KmsOperation de forma tipada; accedemos al campo real del objeto
      const type = (operation as Record<string, unknown>).type as { kty?: string; crv?: string } | undefined
      if (!type) return true
      return type.kty === 'OKP' && type.crv === 'Ed25519'
    }
    if (operation.operation === 'importKey') return true
    if (operation.operation === 'decrypt' || operation.operation === 'encrypt') return true
    if (operation.operation === 'sign' || operation.operation === 'verify') return true
    return false
  }

  public async getPublicKey(_agentContext: AgentContext, keyId: string): Promise<Ed25519PublicJwk | null> {
    const entry = this.getKey(keyId)
    return entry ? entry.publicJwk : null
  }

  public async createKey<Type extends Kms.KmsCreateKeyType>(
    _agentContext: AgentContext,
    options: Kms.KmsCreateKeyOptions<Type>
  ): Promise<Kms.KmsCreateKeyReturn<Type>> {
    // Credo tipifica options.type como genérico KmsCreateKeyType; 'crv' no está expuesto en la interfaz base
    const type = options.type as { kty: string; crv?: string }
    if (type.kty !== 'OKP' || type.crv !== 'Ed25519') {
      throw new Error('Only OKP Ed25519 supported in InternalKeyManagementService')
    }
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const kid = options.keyId ?? utils.uuid()
    // Node.js crypto exporta JsonWebKey genérico; lo casteamos a nuestro tipo concreto
    const publicJwk = publicKey.export({ format: 'jwk' }) as unknown as Ed25519PublicJwk
    const privateJwk = privateKey.export({ format: 'jwk' }) as unknown as Ed25519PrivateJwk
    publicJwk.kid = kid
    privateJwk.kid = kid
    this.saveKey(kid, publicJwk, privateJwk)
    // Credo usa genéricos con branded types en KmsCreateKeyReturn<Type>; no es posible construir el tipo exacto
    return { keyId: kid, publicJwk } as unknown as Kms.KmsCreateKeyReturn<Type>
  }

  public async importKey<Jwk extends Kms.KmsJwkPrivate>(_agentContext: AgentContext, options: Kms.KmsImportKeyOptions<Jwk>) {
    const kid = options.privateJwk.kid ?? utils.uuid()
    // Credo requiere su propio tipo JWK union interno; nuestro Ed25519PrivateJwk no coincide con esa union
    const publicJwk = Kms.publicJwkFromPrivateJwk(options.privateJwk as Kms.KmsJwkPrivate)
    publicJwk.kid = kid
    this.saveKey(kid, publicJwk as unknown as Ed25519PublicJwk, options.privateJwk as unknown as Ed25519PrivateJwk)
    // KmsImportKeyReturn<Jwk> usa branded generics; no se puede construir sin cast
    return { keyId: kid, publicJwk } as unknown as Kms.KmsImportKeyReturn<Jwk>
  }

  public async deleteKey(_agentContext: AgentContext, options: Kms.KmsDeleteKeyOptions): Promise<boolean> {
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
    // Credo tipifica data como Uint8ArrayBuffer (branded); Buffer.from lo acepta como Uint8Array
    const data = options.data instanceof Uint8Array ? options.data : Buffer.from(options.data as unknown as ArrayBuffer)
    const privateKey = createPrivateKey({ key: entry.privateJwk as unknown as JsonWebKey, format: 'jwk' })
    const signature = sign(null, data, privateKey)
    // Credo espera Uint8ArrayBuffer (branded type); Buffer es compatible en runtime pero no en tipos
    return { signature: signature as unknown as Uint8ArrayBuffer }
  }

  public async verify(_agentContext: AgentContext, options: Kms.KmsVerifyOptions): Promise<Kms.KmsVerifyReturn> {
    const { key, algorithm, data, signature } = options
    const publicJwk: Ed25519PublicJwk | null =
      'keyId' in key && key.keyId
        ? (this.getKey(key.keyId)?.publicJwk ?? null)
        // Credo pasa publicJwk en key cuando no hay keyId; el tipo union no lo expone directamente
        : ((key as { publicJwk: Ed25519PublicJwk }).publicJwk ?? null)
    if (!publicJwk) throw new Kms.KeyManagementError('Public key not found for verify')
    if (algorithm !== 'EdDSA' && algorithm !== 'Ed25519') {
      throw new Kms.KeyManagementError(`Only EdDSA/Ed25519 supported, got ${algorithm}`)
    }
    const { createPublicKey, verify } = await import('crypto')
    const pubKey = createPublicKey({ key: publicJwk as unknown as JsonWebKey, format: 'jwk' })
    // Credo tipifica data/signature como Uint8ArrayBuffer; Buffer.from acepta Uint8Array en runtime
    const dataBuf = data instanceof Uint8Array ? data : Buffer.from(data as unknown as ArrayBuffer)
    const sigBuf = signature instanceof Uint8Array ? signature : Buffer.from(signature as unknown as ArrayBuffer)
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
    // Credo pasa propiedades extra (key, encryption, plaintext) que KmsEncryptOptions no expone en sus tipos
    const opts = _options as unknown as {
      data?: Uint8Array
      plaintext?: Uint8Array
      key: EncryptDecryptKey
      encryption?: EncryptionOptions
    }
    if (opts.data === undefined && opts.plaintext !== undefined) opts.data = opts.plaintext
    const data = opts.data instanceof Uint8Array ? opts.data : Uint8Array.from(Buffer.from(opts.data as unknown as ArrayBuffer))

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
        // Credo espera Uint8ArrayBuffer (branded); Buffer es compatible en runtime
        return { encrypted: encrypted as unknown as Uint8ArrayBuffer, iv: undefined as unknown as Uint8ArrayBuffer, tag: undefined as unknown as Uint8ArrayBuffer }
      }
      return {
        encrypted: Buffer.from(boxed) as unknown as Uint8ArrayBuffer,
        iv: nonce as unknown as Uint8ArrayBuffer,
        // Credo requiere tag en KmsEncryptReturn aunque key agreement no genera auth tag separado
        tag: undefined as unknown as Uint8ArrayBuffer,
      }
    }

    if (key?.privateJwk?.kty === 'oct') {
      const symKey = Buffer.from(key.privateJwk.k, 'base64url')
      if (symKey.length !== 32) throw new Kms.KeyManagementError('encrypt: symmetric key must be 32 bytes')
      const iv = randomBytes(12)
      const encOpts: EncryptionOptions = opts.encryption || {}
      const aad = encOpts.aad
        ? (typeof encOpts.aad === 'string' ? Buffer.from(encOpts.aad, 'base64') : Buffer.from(encOpts.aad))
        : undefined
      // Node.js @types/node no tipifica authTagLength en CipherCCMOptions para chacha20-poly1305
      const cipher = createCipheriv('chacha20-poly1305', symKey, iv, { authTagLength: 16 } as Parameters<typeof createCipheriv>[3])
      // setAAD no está en el tipo base Cipher; solo existe en CipherCCM/CipherGCM
      if (aad) (cipher as unknown as { setAAD(buf: Buffer): void }).setAAD(aad)
      const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
      const tag = (cipher as unknown as { getAuthTag(): Buffer }).getAuthTag()
      return {
        encrypted: encrypted as unknown as Uint8ArrayBuffer,
        iv: iv as unknown as Uint8ArrayBuffer,
        tag: tag as unknown as Uint8ArrayBuffer,
      }
    }

    throw new Kms.KeyManagementError('encrypt: key.keyAgreement or key.privateJwk (oct) required')
  }

  public async decrypt(_agentContext: AgentContext, _options: Kms.KmsDecryptOptions): Promise<Kms.KmsDecryptReturn> {
    // Credo pasa propiedades extra (key, encrypted, decryption) que KmsDecryptOptions no expone en sus tipos
    const opts = _options as unknown as {
      encrypted: Uint8Array
      key: EncryptDecryptKey
      decryption?: DecryptionOptions
    }
    const encrypted = opts.encrypted instanceof Uint8Array ? opts.encrypted : Uint8Array.from(Buffer.from(opts.encrypted as unknown as ArrayBuffer))
    const dec: DecryptionOptions = opts.decryption ?? {}

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
      // Node.js @types/node no tipifica authTagLength para chacha20-poly1305
      const decipher = createDecipheriv('chacha20-poly1305', symKey, iv, { authTagLength: 16 } as Parameters<typeof createDecipheriv>[3])
      // setAAD solo existe en DecipherCCM/DecipherGCM, no en el tipo base Decipher
      if (aad) (decipher as unknown as { setAAD(buf: Buffer): void }).setAAD(aad)
      // setAuthTag solo existe en DecipherGCM/DecipherCCM; chacha20-poly1305 lo soporta en runtime
      if (tag) (decipher as unknown as { setAuthTag(buf: Buffer): void }).setAuthTag(tag)
      const data = Buffer.concat([decipher.update(encrypted), decipher.final()])
      return { data: data as unknown as Uint8ArrayBuffer }
    }

    throw new Kms.KeyManagementError('decrypt: key.keyAgreement or key.privateJwk (oct) required')
  }

  public randomBytes(_agentContext: AgentContext, options: Kms.KmsRandomBytesOptions): Buffer {
    return randomBytes(options.length)
  }
}
