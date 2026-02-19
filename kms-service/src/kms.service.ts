import { Injectable } from '@nestjs/common'
import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify, createHash, createCipheriv, createDecipheriv } from 'crypto'
import { openKmsDb } from './db'
import { generateKeyPairSync, randomBytes } from 'crypto'
import { generateBls12381G2KeyPair, blsSign } from '@mattrglobal/bbs-signatures'
import * as bs58 from 'bs58'
import * as ed2curve from 'ed2curve'
import * as nacl from 'tweetnacl'

/** RFC 7638: JWK thumbprint = base64url(SHA-256(canonical JWK)). Claves en orden lexicográfico. */
function jwkThumbprint(jwk: { kty: string; crv?: string; x?: string; [k: string]: any }): string {
  const parts: [string, string][] = []
  if (jwk.crv) parts.push(['crv', jwk.crv])
  parts.push(['kty', jwk.kty])
  if (jwk.x) parts.push(['x', jwk.x])
  parts.sort((a, b) => a[0].localeCompare(b[0]))
  const canon = JSON.stringify(Object.fromEntries(parts))
  const hash = createHash('sha256').update(canon).digest()
  return hash.toString('base64url')
}

/**
 * Multibase fingerprint para Ed25519 (z6M...). did:key usa multibase base58btc + multicodec 0xed.
 * Credo usa este formato en DidRecord.didDocumentRelativeKeyId.
 */
function jwkToMultibaseFingerprintEd25519(jwk: { kty: string; crv?: string; x?: string }): string | null {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) return null
  const raw = Buffer.from(jwk.x, 'base64url')
  if (raw.length !== 32) return null
  // multicodec ed25519-pub: 0xed (varint = 0xed 0x01)
  const prefixed = Buffer.concat([Buffer.from([0xed, 0x01]), raw])
  return 'z' + bs58.encode(prefixed)
}

/** Ed25519 -> X25519 usando ed2curve (compatible con libsodium/Credo). */
function ed25519PublicKeyToX25519(ed25519Pub: Uint8Array): Uint8Array | null {
  const converted = ed2curve.convertPublicKey(ed25519Pub)
  return converted ? new Uint8Array(converted) : null
}

/**
 * Multibase fingerprint para X25519 (z6L...). Deriva X25519 público de Ed25519 (did:key spec).
 * Credo usa z6L para recipientKeyFingerprints en DIDComm (key agreement).
 */
function jwkToMultibaseFingerprintX25519(jwk: { kty: string; crv?: string; x?: string }): string | null {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) return null
  const edPub = new Uint8Array(Buffer.from(jwk.x, 'base64url'))
  if (edPub.length !== 32) return null
  const x25519Pub = ed25519PublicKeyToX25519(edPub)
  if (!x25519Pub) return null
  // multicodec x25519-pub: 0xec (varint = 0xec 0x01)
  const prefixed = Buffer.concat([Buffer.from([0xec, 0x01]), Buffer.from(x25519Pub)])
  return 'z' + bs58.encode(prefixed)
}

/** Thumbprint RFC 7638 de la forma X25519 del par Ed25519. Credo usa este kid en JWE Authcrypt. */
function jwkToX25519Thumbprint(jwk: { kty: string; crv?: string; x?: string }): string | null {
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x) return null
  const edPub = new Uint8Array(Buffer.from(jwk.x, 'base64url'))
  if (edPub.length !== 32) return null
  const x25519Pub = ed25519PublicKeyToX25519(edPub)
  if (!x25519Pub) return null
  const x25519Jwk = {
    crv: 'X25519',
    kty: 'OKP',
    x: Buffer.from(x25519Pub).toString('base64url'),
  }
  return jwkThumbprint(x25519Jwk)
}

/**
 * Servicio de gestión de claves.
 *
 * Crea pares Ed25519 o Bls12381G2, importa claves JWK, persiste en SQLite.
 * Los agentes Credo lo usan vía RemoteKeyManagementService.
 */
@Injectable()
export class KmsService {
  private dbPromise = openKmsDb(process.env.KMS_SQLITE_PATH)

  /** Crea par Ed25519 o Bls12381G2. type: 'Ed25519' | 'Bls12381G2'. Retorna keyId, publicJwk (Ed25519) o { publicKeyBase58 } (BLS). */
  async createKey(keyId?: string, type: 'Ed25519' | 'Bls12381G2' = 'Ed25519') {
    const id = keyId || require('crypto').randomUUID()
    const db = await this.dbPromise

    if (type === 'Bls12381G2') {
      const keyPair = await generateBls12381G2KeyPair()
      const publicKeyBase58 = bs58.encode(Buffer.from(keyPair.publicKey))
      const publicBlob = JSON.stringify({
        keyType: 'Bls12381G2',
        publicKeyBase58,
        publicKeyBase64: Buffer.from(keyPair.publicKey).toString('base64'),
      })
      const privateBlob = JSON.stringify({
        keyType: 'Bls12381G2',
        secretKeyBase64: Buffer.from(keyPair.secretKey).toString('base64'),
      })
      await db.run(
        'INSERT OR REPLACE INTO keys (id, keyType, publicJwk, privateJwk) VALUES (?, ?, ?, ?)',
        [id, 'Bls12381G2', publicBlob, privateBlob]
      )
      return { keyId: id, publicKeyBase58, publicJwk: null }
    }

    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const publicJwk = publicKey.export({ format: 'jwk' })
    const privateJwk = privateKey.export({ format: 'jwk' })
    publicJwk.kid = id
    privateJwk.kid = id
    await db.run(
      'INSERT OR REPLACE INTO keys (id, keyType, publicJwk, privateJwk) VALUES (?, ?, ?, ?)',
      [id, 'Ed25519', JSON.stringify(publicJwk), JSON.stringify(privateJwk)]
    )
    return { keyId: id, publicJwk }
  }

  /** Resuelve keyId: por id directo, JWK thumbprint (RFC 7638) o fingerprint multibase (z6M/z6L). Credo puede pasar cualquiera. */
  private async resolveKeyId(id: string): Promise<string | null> {
    const db = await this.dbPromise
    const row = await db.get('SELECT id FROM keys WHERE id = ?', [id])
    if (row) return (row as { id: string }).id
    // Extraer fragmento si viene como did:xxx#z6M... o #z6M...
    const fingerprint = id.includes('#') ? id.split('#').pop()! : id
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidLike.test(fingerprint)) return null
    const rows = await db.all('SELECT id, publicJwk FROM keys WHERE keyType = ?', ['Ed25519'])
    const debug: string[] = []
    for (const r of rows as { id: string; publicJwk: string }[]) {
      const jwk = JSON.parse(r.publicJwk) as { kty: string; crv?: string; x?: string }
      const tpEd = jwkThumbprint(jwk)
      const tpX = jwkToX25519Thumbprint(jwk)
      if (tpEd === fingerprint) return r.id
      if (tpX && tpX === fingerprint) return r.id
      const mbEd = jwkToMultibaseFingerprintEd25519(jwk)
      const mbX = jwkToMultibaseFingerprintX25519(jwk)
      if ((mbEd && mbEd === fingerprint) || (mbX && mbX === fingerprint)) return r.id
      debug.push(`id=${r.id.slice(0, 8)} tpEd=${tpEd} tpX=${tpX}`)
    }
    if (debug.length > 0) {
      console.warn('[kms] resolveKeyId NO MATCH. lookup=', fingerprint)
      debug.forEach((d) => console.warn('[kms]   ', d))
    }
    return null
  }

  /** DEBUG: Lista todas las claves Ed25519 con sus thumbprints (Ed25519 y X25519). */
  async listKeysDebug() {
    const db = await this.dbPromise
    const rows = await db.all('SELECT id, publicJwk FROM keys WHERE keyType = ?', ['Ed25519'])
    return (rows as { id: string; publicJwk: string }[]).map((r) => {
      const jwk = JSON.parse(r.publicJwk) as { kty: string; crv?: string; x?: string }
      return {
        id: r.id,
        tpEd25519: jwkThumbprint(jwk),
        tpX25519: jwkToX25519Thumbprint(jwk),
        z6L: jwkToMultibaseFingerprintX25519(jwk),
      }
    })
  }

  /** Obtiene la clave pública (JWK Ed25519 o { publicKeyBase58 } BLS) por keyId o thumbprint. Retorna null si no existe. */
  async getPublicKey(id: string) {
    console.warn('[kms] getPublicKey CALLED id=', id)
    const keyId = await this.resolveKeyId(id)
    if (!keyId) {
      const db = await this.dbPromise
      const count = await db.get('SELECT count(*) as c FROM keys WHERE keyType = ?', ['Ed25519']) as { c: number }
      console.warn('[kms] getPublicKey FAIL id=', id, 'ed25519Keys=', count?.c ?? 0)
      return null
    }
    console.warn('[kms] getPublicKey OK id=', id?.slice?.(0, 30), '-> keyId=', keyId)
    const db = await this.dbPromise
    const row = await db.get('SELECT keyType, publicJwk FROM keys WHERE id = ?', [keyId])
    if (!row) return null
    const data = row as { keyType?: string | null; publicJwk: string }
    if (data.keyType === 'Bls12381G2') {
      const blob = JSON.parse(data.publicJwk)
      return { keyType: 'Bls12381G2', publicKeyBase58: blob.publicKeyBase58 }
    }
    const jwk = JSON.parse(data.publicJwk)
    jwk.kid = keyId
    return jwk
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

  /** Firma datos con Ed25519. data: Buffer o base64. Retorna firma en base64. */
  async sign(keyId: string, data: Buffer | string): Promise<string> {
    const resolved = await this.resolveKeyId(keyId)
    const id = resolved ?? keyId
    const db = await this.dbPromise
    const row = await db.get('SELECT privateJwk FROM keys WHERE id = ?', [id])
    if (!row) throw new Error(`Key ${keyId} not found`)

    const privateJwk = JSON.parse(row.privateJwk)
    const keyObject = createPrivateKey({ key: privateJwk, format: 'jwk' })
    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'base64') : data
    const signature = cryptoSign(null, dataBuffer, keyObject)
    return signature.toString('base64')
  }

  /** Verifica firma Ed25519. data y signature en Buffer o base64. */
  async verify(keyId: string, data: Buffer | string, signature: Buffer | string): Promise<boolean> {
    const resolved = await this.resolveKeyId(keyId)
    const id = resolved ?? keyId
    const db = await this.dbPromise
    const row = await db.get('SELECT publicJwk FROM keys WHERE id = ?', [id])
    if (!row) throw new Error(`Key ${keyId} not found`)

    const publicJwk = JSON.parse(row.publicJwk)
    const keyObject = createPublicKey({ key: publicJwk, format: 'jwk' })
    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'base64') : data
    const sigBuffer = typeof signature === 'string' ? Buffer.from(signature, 'base64') : signature
    return cryptoVerify(null, dataBuffer, keyObject, sigBuffer)
  }

  /**
   * Cifrado real para DIDComm: keyAgreement (ECDH X25519 + XSalsa20-Poly1305) o symmetric (C20P/ChaCha20-Poly1305).
   * Body: { key: { keyAgreement?: { keyId, externalPublicJwk } | privateJwk?: { kty:'oct', k } }, encryption: { algorithm, aad? }, data: base64 }
   */
  async encrypt(body: any) {
    const data = this.b64ToBuf(body.data)
    if (!data) throw new Error('encrypt: data required')

    const key = body.key
    const encOpts = body.encryption || {}
    const algorithm = encOpts.algorithm || 'XSALSA20-POLY1305'

    if (key?.keyAgreement) {
      const ka = key.keyAgreement
      const keyId = ka.keyId ?? ka.senderKeyId
      const externalPublicJwk = ka.externalPublicJwk ?? ka.recipientPublicKey ?? ka.recipientKey
      if (!externalPublicJwk?.x) {
        console.error('[kms] encrypt keyAgreement keys:', Object.keys(ka || {}), 'hasKeyId=', !!keyId)
        throw new Error('encrypt: keyAgreement.externalPublicJwk required')
      }
      return this.encryptKeyAgreement({ ...ka, keyId, externalPublicJwk }, data, algorithm)
    }
    if (key?.privateJwk?.kty === 'oct') {
      return this.encryptSymmetric(key.privateJwk, data, encOpts)
    }
    console.error('[kms] encrypt key keys:', key ? Object.keys(key) : 'null')
    throw new Error('encrypt: key.keyAgreement or key.privateJwk (oct) required')
  }

  private async encryptKeyAgreement(keyAgreement: any, data: Uint8Array, _algorithm: string) {
    const keyId = keyAgreement.keyId
    const externalPublicJwk = keyAgreement.externalPublicJwk
    if (!externalPublicJwk?.x) throw new Error('encrypt: externalPublicJwk required')
    const theirPublicX25519 = Buffer.from(externalPublicJwk.x, 'base64url')
    if (theirPublicX25519.length !== 32) throw new Error('encrypt: externalPublicJwk.x must be 32 bytes')

    let x25519Secret: Uint8Array
    let isAnoncrypt = false

    if (keyId) {
      const db = await this.dbPromise
      const resolvedKeyId = await this.resolveKeyId(keyId)
      const id = resolvedKeyId || keyId
      const row = await db.get('SELECT privateJwk, publicJwk FROM keys WHERE id = ? AND keyType = ?', [id, 'Ed25519'])
      if (!row) throw new Error(`Key ${keyId} not found`)

      const privJwk = JSON.parse((row as any).privateJwk)
      const pubJwk = JSON.parse((row as any).publicJwk)
      const ed25519Secret = Buffer.concat([
        Buffer.from(privJwk.d, 'base64url'),
        Buffer.from(pubJwk.x, 'base64url'),
      ])
      if (ed25519Secret.length !== 64) throw new Error('encrypt: invalid Ed25519 key format')
      const converted = ed2curve.convertSecretKey(ed25519Secret)
      if (!converted) throw new Error('encrypt: failed to convert Ed25519 to X25519')
      x25519Secret = converted as Uint8Array
    } else {
      isAnoncrypt = true
      const ephemeral = nacl.box.keyPair()
      x25519Secret = ephemeral.secretKey
      var ephemeralPub = Buffer.from(ephemeral.publicKey)
    }

    const nonce = randomBytes(24)
    const boxed = nacl.box(data, nonce, theirPublicX25519 as Uint8Array, x25519Secret)
    if (!boxed) throw new Error('encrypt: nacl.box failed')

    if (isAnoncrypt) {
      const encrypted = Buffer.concat([ephemeralPub!, nonce, Buffer.from(boxed)])
      return { encrypted: encrypted.toString('base64'), iv: undefined, tag: undefined }
    }
    return {
      encrypted: Buffer.from(boxed).toString('base64'),
      iv: nonce.toString('base64'),
      tag: undefined,
    }
  }

  private encryptSymmetric(privateJwk: { kty?: string; k: string }, data: Uint8Array, encOpts: any) {
    if (privateJwk.kty !== 'oct' || !privateJwk.k) throw new Error('encrypt: privateJwk kty oct with k required')
    const key = Buffer.from(privateJwk.k, 'base64url')
    if (key.length !== 32) throw new Error('encrypt: symmetric key must be 32 bytes')

    const iv = randomBytes(12)
    const aad = encOpts.aad ? this.b64ToBuf(encOpts.aad) : undefined
    const cipher = createCipheriv('chacha20-poly1305', key, iv, { authTagLength: 16 } as any)
    if (aad) (cipher as any).setAAD(aad)

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
    const tag = (cipher as any).getAuthTag() as Buffer
    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    }
  }

  private b64ToBuf(v: any): Buffer | null {
    if (v == null) return null
    if (Buffer.isBuffer(v)) return v
    if (typeof v === 'string') return Buffer.from(v, 'base64')
    if (v instanceof Uint8Array) return Buffer.from(v)
    return null
  }

  async decrypt(body: any) {
    const encrypted = this.b64ToBuf(body.encrypted)
    const iv = this.b64ToBuf(body.iv)
    const tag = body.tag ? this.b64ToBuf(body.tag) : undefined
    if (!encrypted) throw new Error('decrypt: encrypted required')

    const key = body.key
    const encOpts = body.encryption || {}
    const algorithm = encOpts.algorithm || 'XSALSA20-POLY1305'

    if (key?.keyAgreement) {
      return this.decryptKeyAgreement(key.keyAgreement, encrypted, iv)
    }
    if (key?.privateJwk?.kty === 'oct') {
      return this.decryptSymmetric(key.privateJwk, encrypted, iv, tag, encOpts)
    }
    throw new Error('decrypt: key.keyAgreement or key.privateJwk (oct) required')
  }

  private async decryptKeyAgreement(keyAgreement: any, encrypted: Uint8Array, nonce: Buffer | null) {
    const keyId = keyAgreement.keyId
    if (!keyId) throw new Error('decrypt: keyAgreement.keyId required')

    const db = await this.dbPromise
    const resolvedKeyId = await this.resolveKeyId(keyId)
    const id = resolvedKeyId || keyId
    const row = await db.get('SELECT privateJwk, publicJwk FROM keys WHERE id = ? AND keyType = ?', [id, 'Ed25519'])
    if (!row) throw new Error(`Key ${keyId} not found`)

    const privJwk = JSON.parse((row as any).privateJwk)
    const pubJwk = JSON.parse((row as any).publicJwk)
    const ed25519Secret = Buffer.concat([
      Buffer.from(privJwk.d, 'base64url'),
      Buffer.from(pubJwk.x, 'base64url'),
    ]) as Uint8Array
    const x25519Secret = ed2curve.convertSecretKey(ed25519Secret)
    if (!x25519Secret) throw new Error('decrypt: failed to convert Ed25519 to X25519')

    const externalPublicJwk = keyAgreement.externalPublicJwk

    if (externalPublicJwk?.x && nonce && nonce.length === 24) {
      const theirPublicX25519 = Buffer.from(externalPublicJwk.x, 'base64url') as Uint8Array
      const opened = nacl.box.open(encrypted, nonce as Uint8Array, theirPublicX25519, x25519Secret as Uint8Array)
      if (!opened) throw new Error('decrypt: nacl.box.open failed (authcrypt)')
      return { data: Buffer.from(opened).toString('base64') }
    }

    if (encrypted.length <= 56) throw new Error('decrypt: encrypted too short for anoncrypt (need 32+24+data)')
    const ephemeralPub = encrypted.subarray(0, 32)
    const extractedNonce = encrypted.subarray(32, 56)
    const boxed = encrypted.subarray(56)
    const opened = nacl.box.open(boxed, extractedNonce, ephemeralPub, x25519Secret as Uint8Array)
    if (!opened) throw new Error('decrypt: nacl.box.open failed (anoncrypt)')
    return { data: Buffer.from(opened).toString('base64') }
  }

  private decryptSymmetric(privateJwk: { kty?: string; k: string }, encrypted: Buffer, iv: Buffer | null | undefined, tag: Buffer | null | undefined, encOpts: any) {
    if (privateJwk.kty !== 'oct' || !privateJwk.k) throw new Error('decrypt: privateJwk kty oct with k required')
    if (!iv || iv.length !== 12) throw new Error('decrypt: iv (12 bytes) required')
    const key = Buffer.from(privateJwk.k, 'base64url')
    const ivBuf = iv as Buffer

    const decipher = createDecipheriv('chacha20-poly1305', key, ivBuf, { authTagLength: 16 } as any)
    const aad = encOpts.aad ? this.b64ToBuf(encOpts.aad) : undefined
    if (aad) (decipher as any).setAAD(aad)
    if (tag) decipher.setAuthTag(tag)
    const data = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return { data: data.toString('base64') }
  }

  /** Firma verifyData (hash SHA-256 de N-Quads) con clave BLS. keyId debe ser Bls12381G2. Retorna proofValue en base64url. */
  async signBbs(keyId: string, data: Buffer | string): Promise<string> {
    const db = await this.dbPromise
    const row = await db.get('SELECT keyType, publicJwk, privateJwk FROM keys WHERE id = ?', [keyId])
    if (!row) throw new Error(`Key ${keyId} not found`)
    const r = row as { keyType: string; publicJwk: string; privateJwk: string }
    if (r.keyType !== 'Bls12381G2') throw new Error(`Key ${keyId} is not Bls12381G2`)

    const pubBlob = JSON.parse(r.publicJwk)
    const privBlob = JSON.parse(r.privateJwk)
    const publicKey = new Uint8Array(Buffer.from(pubBlob.publicKeyBase64, 'base64'))
    const secretKey = new Uint8Array(Buffer.from(privBlob.secretKeyBase64, 'base64'))
    const keyPair = { publicKey, secretKey }

    const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'base64') : data
    const messages = [new Uint8Array(dataBuffer)]
    const signature = await blsSign({ keyPair, messages })
    return Buffer.from(signature).toString('base64url')
  }
}

