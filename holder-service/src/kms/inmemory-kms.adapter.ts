import { AgentContext, Kms, utils } from '@credo-ts/core'
import type { Uint8ArrayBuffer } from '@credo-ts/core'
import { randomBytes, generateKeyPairSync, createPrivateKey, sign } from 'crypto'

/**
 * Adaptador KMS en memoria para POC.
 * Implementa la interfaz de Credo KeyManagementService.
 */
export class MockKeyManagementService implements Kms.KeyManagementService {
  public static readonly backend = 'mock'
  public readonly backend = MockKeyManagementService.backend

  private keys = new Map<string, { privateJwk: any; publicJwk: any }>()

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
    const entry = this.keys.get(keyId)
    return entry ? entry.publicJwk : null
  }

  public async createKey<Type extends Kms.KmsCreateKeyType>(
    _agentContext: AgentContext,
    options: Kms.KmsCreateKeyOptions<Type>
  ): Promise<Kms.KmsCreateKeyReturn<Type>> {
    if (options.type.kty !== 'OKP' || (options.type as any).crv !== 'Ed25519') {
      throw new Error('Only OKP Ed25519 supported in MockKeyManagementService')
    }
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    const kid = options.keyId ?? utils.uuid()
    const publicJwk = publicKey.export({ format: 'jwk' }) as any
    const privateJwk = privateKey.export({ format: 'jwk' }) as any
    publicJwk.kid = kid
    privateJwk.kid = kid
    this.keys.set(kid, { privateJwk, publicJwk })
    return { keyId: kid, publicJwk } as unknown as Kms.KmsCreateKeyReturn<Type>
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

  public async sign(_agentContext: AgentContext, options: Kms.KmsSignOptions): Promise<Kms.KmsSignReturn> {
    const entry = this.keys.get(options.keyId)
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
        ? await this.getPublicKey(_agentContext, key.keyId)
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
