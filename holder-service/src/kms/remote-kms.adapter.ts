import { AgentContext, Kms } from '@credo-ts/core'
import type { Uint8ArrayBuffer } from '@credo-ts/core'

/**
 * Adaptador KMS remoto. Traduce llamadas de Credo a HTTP hacia kms-service.
 * Soporta createKey, getPublicKey, sign, verify, encrypt/decrypt (stub).
 */
export class RemoteKeyManagementService implements Kms.KeyManagementService {
  public static readonly backend = 'remote'
  public readonly backend = RemoteKeyManagementService.backend

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
      const type = (operation as any).type
      if (!type) return true
      if (type.kty === 'OKP' && type.crv === 'Ed25519') return true
      if ((type as any).keyType === 'Bls12381G2') return true
      return false
    }
    if (operation.operation === 'importKey') return true
    if (operation.operation === 'decrypt' || operation.operation === 'encrypt') return true
    if (operation.operation === 'sign' || operation.operation === 'verify') return true
    return false
  }

  public async getPublicKey(_agentContext: AgentContext, keyId: string): Promise<any> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/keys/${encodeURIComponent(keyId)}`
    const res = await fetch(url, { method: 'GET' })
    if (res.status === 404) return null
    if (!res.ok) throw new Kms.KeyManagementError(`KMS ${res.status}: ${await res.text()}`)
    return res.json()
  }

  public async createKey<Type extends Kms.KmsCreateKeyType>(
    _agentContext: AgentContext,
    options: Kms.KmsCreateKeyOptions<Type>
  ): Promise<Kms.KmsCreateKeyReturn<Type>> {
    const type = options.type as any
    const body: any = { keyId: options.keyId }
    if (type?.keyType === 'Bls12381G2') {
      body.type = { keyType: 'Bls12381G2' }
    } else {
      body.type = { kty: type?.kty || 'OKP', crv: type?.crv || 'Ed25519' }
    }
    const r = await this.fetch<{ keyId: string; publicJwk?: any; publicKeyBase58?: string }>('/keys', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return {
      keyId: r.keyId,
      publicJwk: r.publicJwk ?? undefined,
      publicKeyBase58: r.publicKeyBase58,
    } as unknown as Kms.KmsCreateKeyReturn<Type>
  }

  public async importKey<Jwk extends Kms.KmsJwkPrivate>(_agentContext: AgentContext, options: Kms.KmsImportKeyOptions<Jwk>) {
    return this.fetch<{ keyId: string; publicJwk: any }>('/keys/import', {
      method: 'POST',
      body: JSON.stringify({ privateJwk: options.privateJwk }),
    }) as Promise<Kms.KmsImportKeyReturn<Jwk>>
  }

  public async deleteKey(_agentContext: AgentContext, options: Kms.KmsDeleteKeyOptions): Promise<boolean> {
    await this.fetch(`/keys/${encodeURIComponent(options.keyId)}`, { method: 'DELETE' })
    return true
  }

  public async sign(_agentContext: AgentContext, options: Kms.KmsSignOptions): Promise<Kms.KmsSignReturn> {
    const data =
      options.data instanceof Uint8Array
        ? Buffer.from(options.data).toString('base64')
        : (Buffer.from((options.data as any) as ArrayBuffer).toString('base64'))
    const r = await this.fetch<{ signature: string }>('/sign', {
      method: 'POST',
      body: JSON.stringify({ keyId: options.keyId, data }),
    })
    return { signature: Buffer.from(r.signature, 'base64') }
  }

  public async verify(_agentContext: AgentContext, options: Kms.KmsVerifyOptions): Promise<Kms.KmsVerifyReturn> {
    const opts = options as any
    const keyId = opts.keyId ?? opts.key?.keyId
    const data =
      options.data instanceof Uint8Array
        ? Buffer.from(options.data).toString('base64')
        : Buffer.from((options.data as any) as ArrayBuffer).toString('base64')
    const sig =
      options.signature instanceof Uint8Array
        ? Buffer.from(options.signature).toString('base64')
        : Buffer.from((options.signature as any) as ArrayBuffer).toString('base64')
    const r = await this.fetch<{ valid: boolean }>('/verify', {
      method: 'POST',
      body: JSON.stringify({ keyId, data, signature: sig }),
    })
    return { valid: r.valid } as unknown as Kms.KmsVerifyReturn
  }

  public async encrypt(_agentContext: AgentContext, options: Kms.KmsEncryptOptions): Promise<Kms.KmsEncryptReturn> {
    const opts = options as any
    if (opts.data === undefined && opts.plaintext !== undefined) opts.data = opts.plaintext
    if (opts.data === undefined || opts.data === null) {
      console.error('[holder RemoteKMS] encrypt: options.data undefined. keys=', Object.keys(opts || {}))
      throw new Kms.KeyManagementError('KMS encrypt: options.data is required')
    }
    const data = options.data instanceof Uint8Array ? options.data : Uint8Array.from(Buffer.from(options.data as any))
    const encryption: any = opts.encryption ? { ...opts.encryption } : undefined
    if (encryption?.aad) {
      encryption.aad = Buffer.from(encryption.aad).toString('base64')
    }
    const body: any = {
      key: opts.key,
      encryption,
      data: Buffer.from(data).toString('base64'),
    }
    const r = await this.fetch<{ encrypted: any; iv?: any; tag?: any }>('/encrypt', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const enc = r.encrypted?.data ?? r.encrypted
    return {
      encrypted: (typeof enc === 'string' ? Buffer.from(enc, 'base64') : Buffer.from(enc)) as unknown as Uint8ArrayBuffer,
      iv: r.iv ? (typeof r.iv === 'string' ? Buffer.from(r.iv, 'base64') : Buffer.from(r.iv)) : undefined,
      tag: r.tag ? (typeof r.tag === 'string' ? Buffer.from(r.tag, 'base64') : Buffer.from(r.tag)) : undefined,
    }
  }

  public async decrypt(_agentContext: AgentContext, options: Kms.KmsDecryptOptions): Promise<Kms.KmsDecryptReturn> {
    const opts = options as any
    const enc = opts.encrypted instanceof Uint8Array ? opts.encrypted : Uint8Array.from(Buffer.from(opts.encrypted as any))
    const encryption: any = opts.encryption ? { ...opts.encryption } : undefined
    if (encryption?.aad) encryption.aad = Buffer.from(encryption.aad).toString('base64')
    const body: any = {
      key: opts.key,
      encryption,
      encrypted: Buffer.from(enc).toString('base64'),
    }
    if (opts.iv) body.iv = Buffer.from(opts.iv).toString('base64')
    if (opts.tag) body.tag = Buffer.from(opts.tag).toString('base64')

    const r = await this.fetch<{ data: any }>('/decrypt', { method: 'POST', body: JSON.stringify(body) })
    const raw = r.data
    const data = typeof raw === 'string' ? Buffer.from(raw, 'base64') : Buffer.from(raw || [])
    return { data: new Uint8Array(data) as unknown as Uint8ArrayBuffer }
  }

  public randomBytes(_agentContext: AgentContext, options: Kms.KmsRandomBytesOptions) {
    return this.fetch<{ random: string }>('/random', {
      method: 'POST',
      body: JSON.stringify({ length: options.length }),
    }).then((r) => new Uint8Array(Buffer.from(r.random, 'base64'))) as any
  }
}
