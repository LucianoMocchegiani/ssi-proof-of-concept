import { AgentContext, Kms } from '@credo-ts/core'
import { envConfig } from '../config'

/**
 * Adaptador KMS remoto.
 *
 * Delega operaciones criptográficas a kms-service vía HTTP.
 * createKey, getPublicKey, importKey, deleteKey, encrypt, decrypt.
 */
export class RemoteKeyManagementService {
  public static readonly backend = 'remote-kms'
  public readonly backend = RemoteKeyManagementService.backend

  constructor(private baseUrl: string = envConfig.remoteKmsUrl) {}

  public isOperationSupported(_agentContext: AgentContext, _operation: Kms.KmsOperation): boolean {
    // Assume common ops supported for POC
    return true
  }

  private async call(path: string, init?: RequestInit): Promise<any> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, init)
    if (!res.ok) throw new Error(`RemoteKMS error ${res.status}`)
    return res.json()
  }

  public async getPublicKey(_agentContext: AgentContext, keyId: string) {
    return await this.call(`/keys/${encodeURIComponent(keyId)}`)
  }

  public async createKey<Type extends Kms.KmsCreateKeyType>(_agentContext: AgentContext, options: Kms.KmsCreateKeyOptions<Type>) {
    const body: any = { keyId: options.keyId, type: options.type }
    return await this.call('/keys', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  }

  public async importKey<Jwk extends Kms.KmsJwkPrivate>(_agentContext: AgentContext, options: Kms.KmsImportKeyOptions<Jwk>) {
    return await this.call('/keys/import', { method: 'POST', body: JSON.stringify({ privateJwk: options.privateJwk }), headers: { 'content-type': 'application/json' } })
  }

  public async deleteKey(_agentContext: AgentContext, options: Kms.KmsDeleteKeyOptions) {
    await this.call(`/keys/${encodeURIComponent(options.keyId)}`, { method: 'DELETE' })
    return true
  }

  public async sign(_agentContext: AgentContext, _options: Kms.KmsSignOptions): Promise<Kms.KmsSignReturn> {
    throw new Kms.KeyManagementError('sign not implemented in RemoteKeyManagementService')
  }

  public async verify(_agentContext: AgentContext, _options: Kms.KmsVerifyOptions): Promise<Kms.KmsVerifyReturn> {
    throw new Kms.KeyManagementError('verify not implemented in RemoteKeyManagementService')
  }

  public async encrypt(_agentContext: AgentContext, options: Kms.KmsEncryptOptions): Promise<Kms.KmsEncryptReturn> {
    const r = await this.call('/encrypt', { method: 'POST', body: JSON.stringify(options), headers: { 'content-type': 'application/json' } })
    return r as Kms.KmsEncryptReturn
  }

  public async decrypt(_agentContext: AgentContext, options: Kms.KmsDecryptOptions): Promise<Kms.KmsDecryptReturn> {
    const r = await this.call('/decrypt', { method: 'POST', body: JSON.stringify(options), headers: { 'content-type': 'application/json' } })
    return r as Kms.KmsDecryptReturn
  }

  public randomBytes(_agentContext: AgentContext, options: Kms.KmsRandomBytesOptions): Uint8Array {
    // For compatibility with KMS interface (sync Uint8Array), fallback to local crypto for randomness.
    return require('crypto').randomBytes(options.length)
  }
}
