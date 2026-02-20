import { AgentContext, Kms } from '@credo-ts/core'
import type { Uint8ArrayBuffer } from '@credo-ts/core'
import { randomBytes, type JsonWebKey } from 'crypto'

// ─── Tipos internos del adapter ─────────────────────────────────────

/** JWK público Ed25519 devuelto por el kms-service */
interface Ed25519PublicJwk {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
  kid?: string
}

/** Resultado de POST /keys para Ed25519 */
interface CreateKeyResponse {
  keyId: string
  publicJwk?: Ed25519PublicJwk
  publicKeyBase58?: string
}

/** Resultado de POST /keys/import */
interface ImportKeyResponse {
  keyId: string
  publicJwk: Ed25519PublicJwk
}

/** Resultado de POST /encrypt desde kms-service */
interface EncryptResponse {
  /** Datos cifrados en base64 (o { data: [...] } en algunos edge cases) */
  encrypted: string | { data: number[] }
  /** IV en base64 */
  iv?: string
  /** Auth tag en base64 */
  tag?: string
}

/** Resultado de POST /decrypt desde kms-service */
interface DecryptResponse {
  /** Datos descifrados en base64 */
  data: string
}

/** Opciones de key agreement que Credo pasa en encrypt/decrypt */
interface KeyAgreementParams {
  keyId?: string
  senderKeyId?: string
  externalPublicJwk?: { x: string; [k: string]: unknown }
  recipientPublicKey?: { x: string; [k: string]: unknown }
  recipientKey?: { x: string; [k: string]: unknown }
}

/** JWK simétrico para cifrado C20P */
interface SymmetricJwk {
  kty: 'oct'
  k: string
}

/** Estructura de key para encrypt/decrypt */
interface EncryptDecryptKey {
  keyAgreement?: KeyAgreementParams
  privateJwk?: SymmetricJwk
}

/** Opciones de cifrado enviadas al kms-service */
interface EncryptionOptions {
  algorithm?: string
  aad?: string
}

/** Opciones de descifrado recibidas de Credo */
interface DecryptionOptions {
  algorithm?: string
  iv?: Uint8Array | string
  tag?: Uint8Array | string
  aad?: Uint8Array | string
}

/** Descriptor de tipo de clave (Credo pasa esto al crear) */
interface KeyTypeDescriptor {
  kty?: string
  crv?: string
  keyType?: string
}

/** Body enviado a POST /encrypt */
interface EncryptRequestBody {
  key: EncryptDecryptKey
  encryption?: EncryptionOptions
  data: string
}

/** Body enviado a POST /decrypt */
interface DecryptRequestBody {
  key: EncryptDecryptKey
  encryption?: EncryptionOptions
  encrypted: string
  iv?: string
  tag?: string
}

// ─── Adapter ────────────────────────────────────────────────────────

/**
 * KMS externo: delega operaciones criptográficas al kms-service vía HTTP.
 * Las claves privadas viven en el servicio externo, no en el proceso del agente.
 */
export class ExternalKeyManagementService implements Kms.KeyManagementService {
  public static readonly backend = 'external'
  public readonly backend = ExternalKeyManagementService.backend

  constructor(private readonly baseUrl: string) {}

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`
    const res = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Kms.KeyManagementError(`KMS ${res.status}: ${text}`)
    }
    const ct = res.headers.get('content-type')
    if (ct?.includes('application/json')) return res.json() as T
    return res.text() as unknown as T
  }

  public isOperationSupported(_agentContext: AgentContext, operation: Kms.KmsOperation): boolean {
    if (operation.operation === 'randomBytes') return true
    if (operation.operation === 'createKey') {
      // Credo no expone 'type' en KmsOperation de forma tipada; accedemos al campo real del objeto
      const type = (operation as Record<string, unknown>).type as KeyTypeDescriptor | undefined
      if (!type) return true
      if (type.kty === 'OKP' && type.crv === 'Ed25519') return true
      if (type.keyType === 'Bls12381G2') return true
      return false
    }
    if (operation.operation === 'importKey') return true
    if (operation.operation === 'decrypt' || operation.operation === 'encrypt') return true
    if (operation.operation === 'sign' || operation.operation === 'verify') return true
    return false
  }

  public async getPublicKey(_agentContext: AgentContext, keyId: string): Promise<Ed25519PublicJwk | null> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/keys/${encodeURIComponent(keyId)}`
    const res = await fetch(url, { method: 'GET' })
    if (res.status === 404) return null
    if (!res.ok) throw new Kms.KeyManagementError(`KMS ${res.status}: ${await res.text()}`)
    return res.json() as Promise<Ed25519PublicJwk>
  }

  public async createKey<Type extends Kms.KmsCreateKeyType>(
    _agentContext: AgentContext,
    options: Kms.KmsCreateKeyOptions<Type>
  ): Promise<Kms.KmsCreateKeyReturn<Type>> {
    // Credo tipifica options.type como genérico KmsCreateKeyType; 'crv' y 'keyType' no están en la interfaz base
    const type = options.type as unknown as KeyTypeDescriptor
    const body: { keyId?: string; type: { keyType: string } | { kty: string; crv: string } } = { keyId: options.keyId } as { keyId?: string; type: { keyType: string } | { kty: string; crv: string } }
    if (type?.keyType === 'Bls12381G2') {
      body.type = { keyType: 'Bls12381G2' }
    } else {
      body.type = { kty: type?.kty || 'OKP', crv: type?.crv || 'Ed25519' }
    }
    const r = await this.fetch<CreateKeyResponse>('/keys', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    // KmsCreateKeyReturn<Type> usa branded generics; no se puede construir sin cast
    return {
      keyId: r.keyId,
      publicJwk: r.publicJwk ?? undefined,
      publicKeyBase58: r.publicKeyBase58,
    } as unknown as Kms.KmsCreateKeyReturn<Type>
  }

  public async importKey<Jwk extends Kms.KmsJwkPrivate>(_agentContext: AgentContext, options: Kms.KmsImportKeyOptions<Jwk>) {
    const r = await this.fetch<ImportKeyResponse>('/keys/import', {
      method: 'POST',
      body: JSON.stringify({ privateJwk: options.privateJwk }),
    })
    // KmsImportKeyReturn<Jwk> usa branded generics; no se puede construir sin cast
    return r as unknown as Kms.KmsImportKeyReturn<Jwk>
  }

  public async deleteKey(_agentContext: AgentContext, options: Kms.KmsDeleteKeyOptions): Promise<boolean> {
    await this.fetch(`/keys/${encodeURIComponent(options.keyId)}`, { method: 'DELETE' })
    return true
  }

  public async sign(_agentContext: AgentContext, options: Kms.KmsSignOptions): Promise<Kms.KmsSignReturn> {
    // Credo tipifica data como Uint8ArrayBuffer (branded); Buffer.from lo acepta como Uint8Array en runtime
    const data =
      options.data instanceof Uint8Array
        ? Buffer.from(options.data).toString('base64')
        : Buffer.from(options.data as unknown as ArrayBuffer).toString('base64')
    const r = await this.fetch<{ signature: string }>('/sign', {
      method: 'POST',
      body: JSON.stringify({ keyId: options.keyId, data }),
    })
    return { signature: Buffer.from(r.signature, 'base64') }
  }

  public async verify(_agentContext: AgentContext, options: Kms.KmsVerifyOptions): Promise<Kms.KmsVerifyReturn> {
    const { key, data, signature } = options
    // Credo tipifica key como union (keyId | publicJwk); accedemos a publicJwk si está presente
    const publicJwk = ('publicJwk' in key) ? (key as { publicJwk: Ed25519PublicJwk }).publicJwk : undefined

    if (publicJwk) {
      const { createPublicKey, verify } = await import('crypto')
      const pubKey = createPublicKey({ key: publicJwk as unknown as JsonWebKey, format: 'jwk' })
      const dataBuf = data instanceof Uint8Array ? data : Buffer.from(data as unknown as ArrayBuffer)
      const sigBuf = signature instanceof Uint8Array ? signature : Buffer.from(signature as unknown as ArrayBuffer)
      const valid = verify(null, dataBuf, pubKey, sigBuf)
      // KmsVerifyReturn es union { verified: true, publicJwk } | { verified: false }; el tipo exacto requiere cast
      return (valid ? { verified: true, publicJwk } : { verified: false }) as Kms.KmsVerifyReturn
    }

    const keyId = ('keyId' in key) ? (key as { keyId: string }).keyId : undefined
    const dataB64 =
      data instanceof Uint8Array
        ? Buffer.from(data).toString('base64')
        : Buffer.from(data as unknown as ArrayBuffer).toString('base64')
    const sigB64 =
      signature instanceof Uint8Array
        ? Buffer.from(signature).toString('base64')
        : Buffer.from(signature as unknown as ArrayBuffer).toString('base64')
    const r = await this.fetch<{ valid: boolean }>('/verify', {
      method: 'POST',
      body: JSON.stringify({ keyId, data: dataB64, signature: sigB64 }),
    })
    return { valid: r.valid } as unknown as Kms.KmsVerifyReturn
  }

  public async encrypt(_agentContext: AgentContext, options: Kms.KmsEncryptOptions): Promise<Kms.KmsEncryptReturn> {
    // Credo pasa propiedades extra (key, encryption, plaintext) que KmsEncryptOptions no expone en sus tipos
    const opts = options as unknown as {
      data?: Uint8Array
      plaintext?: Uint8Array
      key: EncryptDecryptKey
      encryption?: { algorithm?: string; aad?: Uint8Array | string }
    }
    if (opts.data === undefined && opts.plaintext !== undefined) opts.data = opts.plaintext
    if (opts.data === undefined || opts.data === null) {
      throw new Kms.KeyManagementError('KMS encrypt: options.data is required')
    }
    const data = opts.data instanceof Uint8Array ? opts.data : Uint8Array.from(Buffer.from(opts.data as unknown as ArrayBuffer))
    const encryption: EncryptionOptions | undefined = opts.encryption ? { algorithm: opts.encryption.algorithm } : undefined
    if (opts.encryption?.aad && encryption) encryption.aad = Buffer.from(opts.encryption.aad).toString('base64')
    const body: EncryptRequestBody = { key: opts.key, encryption, data: Buffer.from(data).toString('base64') }
    const r = await this.fetch<EncryptResponse>('/encrypt', { method: 'POST', body: JSON.stringify(body) })
    const enc = typeof r.encrypted === 'object' && r.encrypted !== null && 'data' in r.encrypted
      ? Buffer.from(r.encrypted.data)
      : Buffer.from(r.encrypted as string, 'base64')
    return {
      // Credo espera Uint8ArrayBuffer (branded); Buffer es compatible en runtime
      encrypted: enc as unknown as Uint8ArrayBuffer,
      iv: r.iv ? Buffer.from(r.iv, 'base64') : undefined,
      tag: r.tag ? Buffer.from(r.tag, 'base64') : undefined,
    }
  }

  public async decrypt(_agentContext: AgentContext, options: Kms.KmsDecryptOptions): Promise<Kms.KmsDecryptReturn> {
    // Credo pasa propiedades extra (key, encrypted, decryption) que KmsDecryptOptions no expone en sus tipos
    const opts = options as unknown as {
      encrypted: Uint8Array
      key: EncryptDecryptKey
      decryption?: DecryptionOptions
    }
    const enc = opts.encrypted instanceof Uint8Array ? opts.encrypted : Uint8Array.from(Buffer.from(opts.encrypted as unknown as ArrayBuffer))
    const dec: DecryptionOptions = opts.decryption ?? {}
    const encryption: EncryptionOptions | undefined = dec.algorithm ? { algorithm: dec.algorithm } : undefined
    if (dec.aad && encryption) encryption.aad = Buffer.from(dec.aad).toString('base64')
    const body: DecryptRequestBody = { key: opts.key, encryption, encrypted: Buffer.from(enc).toString('base64') }
    if (dec.iv) body.iv = Buffer.from(dec.iv).toString('base64')
    if (dec.tag) body.tag = Buffer.from(dec.tag).toString('base64')
    const r = await this.fetch<DecryptResponse>('/decrypt', { method: 'POST', body: JSON.stringify(body) })
    const raw = r.data
    const data = typeof raw === 'string' ? Buffer.from(raw, 'base64') : Buffer.from(raw || [])
    return { data: new Uint8Array(data) as unknown as Uint8ArrayBuffer }
  }

  public randomBytes(_agentContext: AgentContext, options: Kms.KmsRandomBytesOptions): Buffer {
    return randomBytes(options.length)
  }
}
