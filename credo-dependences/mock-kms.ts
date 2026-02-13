import { AgentContext, Kms, utils } from '@credo-ts/core'
import type { Uint8ArrayBuffer } from '@credo-ts/core'
import { randomBytes, generateKeyPairSync } from 'crypto'

/**
 * Servicio KMS simulado en memoria para POC.
 * - Soporta creación de claves OKP/Ed25519
 * - Almacena material privado en memoria (NO para producción)
 */
export class MockKeyManagementService implements Kms.KeyManagementService {
  public static readonly backend = 'mock'
  public readonly backend = MockKeyManagementService.backend

  private keys = new Map<string, { privateJwk: any; publicJwk: any }>()

  public isOperationSupported(_agentContext: AgentContext, operation: Kms.KmsOperation): boolean {
    // Debug: log operations to help diagnose selection issues in POC
    // eslint-disable-next-line no-console
    console.log('[MockKMS] isOperationSupported called with operation:', operation)
    if (operation.operation === 'randomBytes') return true
    if (operation.operation === 'createKey') {
      // If type is not provided, accept createKey by default for POC.
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
    const entry = this.keys.get(keyId)
    return entry ? entry.publicJwk : null
  }

  public async createKey<Type extends Kms.KmsCreateKeyType>(
    _agentContext: AgentContext,
    options: Kms.KmsCreateKeyOptions<Type>
  ): Promise<Kms.KmsCreateKeyReturn<Type>> {
    // only implement OKP/Ed25519 for POC
    if (options.type.kty !== 'OKP' || (options.type as any).crv !== 'Ed25519') {
      throw new Error('Only OKP Ed25519 supported in MockKeyManagementService')
    }

    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const kid = options.keyId ?? utils.uuid()

    // Export proper JWKs (Node supports JWK export for ed25519)
    const publicJwk = publicKey.export({ format: 'jwk' }) as any
    const privateJwk = privateKey.export({ format: 'jwk' }) as any

    // Ensure kid present
    publicJwk.kid = kid
    privateJwk.kid = kid

    this.keys.set(kid, { privateJwk, publicJwk })

    return {
      keyId: kid,
      publicJwk: publicJwk,
    } as unknown as Kms.KmsCreateKeyReturn<Type>
  }

  public async importKey<Jwk extends Kms.KmsJwkPrivate>(_agentContext: AgentContext, options: Kms.KmsImportKeyOptions<Jwk>) {
    const kid = options.privateJwk.kid ?? utils.uuid()
    const publicJwk = Kms.publicJwkFromPrivateJwk(options.privateJwk as any)
    publicJwk.kid = kid
    this.keys.set(kid, { privateJwk: options.privateJwk, publicJwk })
    return { keyId: kid, publicJwk } as any
  }

  public async deleteKey(_agentContext: AgentContext, options: Kms.KmsDeleteKeyOptions) {
    return this.keys.delete(options.keyId)
  }
  public async sign(_agentContext: AgentContext, _options: Kms.KmsSignOptions): Promise<Kms.KmsSignReturn> {
    throw new Kms.KeyManagementError('sign not implemented in MockKeyManagementService')
  }

  public async verify(_agentContext: AgentContext, _options: Kms.KmsVerifyOptions): Promise<Kms.KmsVerifyReturn> {
    throw new Kms.KeyManagementError('verify not implemented in MockKeyManagementService')
  }

  public async encrypt(_agentContext: AgentContext, _options: Kms.KmsEncryptOptions): Promise<Kms.KmsEncryptReturn> {
    // POC: insecure helper to satisfy framework expectations.
    // We do NOT perform real encryption here; we return the plaintext as "encrypted"
    // and include dummy iv/tag values when required by the algorithm.
    // WARNING: insecure, only for local testing.
    const data = (_options.data instanceof Uint8Array ? (_options.data as Uint8Array) : Uint8Array.from(Buffer.from(_options.data as any))) as unknown as Uint8ArrayBuffer

    const encAlg = _options.encryption?.algorithm
    let iv: Uint8ArrayBuffer | undefined = undefined
    let tag: Uint8ArrayBuffer | undefined = undefined

    if (encAlg === 'A128GCM' || encAlg === 'A192GCM' || encAlg === 'A256GCM') {
      iv = randomBytes(12) as unknown as Uint8ArrayBuffer
      tag = randomBytes(16) as unknown as Uint8ArrayBuffer
    } else if (encAlg === 'C20P' || encAlg === 'XC20P' || encAlg === 'XSALSA20-POLY1305') {
      iv = randomBytes(12) as unknown as Uint8ArrayBuffer
      tag = randomBytes(16) as unknown as Uint8ArrayBuffer
    } else {
      iv = randomBytes(12) as unknown as Uint8ArrayBuffer
    }

    return {
      encrypted: data,
      iv,
      tag,
    }
  }

  public async decrypt(_agentContext: AgentContext, _options: Kms.KmsDecryptOptions): Promise<Kms.KmsDecryptReturn> {
    // POC: passthrough decrypt that returns the encrypted bytes directly.
    const encrypted = (_options.encrypted instanceof Uint8Array ? (_options.encrypted as Uint8Array) : Uint8Array.from(Buffer.from(_options.encrypted as any))) as unknown as Uint8ArrayBuffer
    return { data: encrypted }
  }

  public randomBytes(_agentContext: AgentContext, options: Kms.KmsRandomBytesOptions) {
    return randomBytes(options.length)
  }
}

