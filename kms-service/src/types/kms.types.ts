// ─── JWK ────────────────────────────────────────────────────────────

/** JWK público Ed25519 (OKP / Ed25519). kid es el UUID interno del KMS. */
export interface Ed25519PublicJwk {
  kty: 'OKP'
  crv: 'Ed25519'
  /** Clave pública en base64url (32 bytes) */
  x: string
  /** Identificador de la clave, UUID asignado por el KMS */
  kid?: string
}

/** JWK privado Ed25519 (OKP / Ed25519). Incluye 'd' (seed). */
export interface Ed25519PrivateJwk extends Ed25519PublicJwk {
  /** Seed privado en base64url (32 bytes) */
  d: string
}

/** JWK público X25519 derivado de Ed25519, usado en key agreement DIDComm. */
export interface X25519PublicJwk {
  kty: 'OKP'
  crv: 'X25519'
  /** Clave pública X25519 en base64url (32 bytes) */
  x: string
  kid?: string
}

/** JWK de clave simétrica (oct). Usado para cifrado simétrico C20P / ChaCha20-Poly1305. */
export interface SymmetricJwk {
  kty: 'oct'
  /** Material de clave en base64url (32 bytes) */
  k: string
}

/** JWK privado genérico para importación. Puede ser Ed25519 u otro. */
export interface ImportablePrivateJwk {
  kty: string
  crv?: string
  x?: string
  /** Seed / material privado */
  d?: string
  kid?: string
  [extra: string]: unknown
}

// ─── Tipos de clave soportados ──────────────────────────────────────

/** Tipos de clave que el KMS puede crear */
export type SupportedKeyType = 'Ed25519' | 'Bls12381G2'

/** Tipo del campo 'type' que envía Credo al crear clave */
export interface KeyTypeDescriptor {
  kty?: string
  crv?: string
  /** Credo envía keyType directamente para BLS */
  keyType?: string
}

// ─── Filas de base de datos ─────────────────────────────────────────

/** Fila de la tabla keys en SQLite */
export interface KeyRow {
  /** UUID de la clave */
  id: string
  /** 'Ed25519' | 'Bls12381G2' */
  keyType: string
  /** JSON string del JWK público (Ed25519) o blob público (BLS) */
  publicJwk: string
  /** JSON string del JWK privado (Ed25519) o blob privado (BLS) */
  privateJwk: string
}

// ─── BLS ────────────────────────────────────────────────────────────

/** Blob público almacenado para claves Bls12381G2 */
export interface BlsPublicBlob {
  keyType: 'Bls12381G2'
  publicKeyBase58: string
  publicKeyBase64: string
}

/** Blob privado almacenado para claves Bls12381G2 */
export interface BlsPrivateBlob {
  keyType: 'Bls12381G2'
  secretKeyBase64: string
}

/** Resultado de getPublicKey cuando la clave es BLS */
export interface BlsPublicKeyResult {
  keyType: 'Bls12381G2'
  publicKeyBase58: string
}

// ─── Resultados de operaciones ──────────────────────────────────────

/** Resultado de createKey para Ed25519 */
export interface CreateKeyResultEd25519 {
  keyId: string
  publicJwk: Ed25519PublicJwk
}

/** Resultado de createKey para BLS */
export interface CreateKeyResultBls {
  keyId: string
  publicKeyBase58: string
  publicJwk: null
}

/** Resultado de importKey */
export interface ImportKeyResult {
  keyId: string
  publicJwk: Record<string, unknown>
}

/** Resultado de encrypt */
export interface EncryptResult {
  /** Datos cifrados en base64 */
  encrypted: string
  /** IV/nonce en base64 (undefined para keyAgreement authcrypt con nonce embebido) */
  iv?: string
  /** Auth tag en base64 (solo para cifrado simétrico) */
  tag?: string
}

/** Resultado de decrypt */
export interface DecryptResult {
  /** Datos descifrados en base64 */
  data: string
}

/** Entrada de listKeysDebug */
export interface KeyDebugEntry {
  id: string
  /** Thumbprint RFC 7638 del JWK Ed25519 */
  tpEd25519: string
  /** Thumbprint RFC 7638 del JWK X25519 derivado */
  tpX25519: string | null
  /** Multibase fingerprint X25519 (z6L...) */
  z6L: string | null
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────────

/** Opciones de key agreement para encrypt/decrypt */
export interface KeyAgreementParams {
  /** UUID o thumbprint de la clave propia (sender para encrypt, recipient para decrypt) */
  keyId?: string
  /** Alias que Credo usa a veces en lugar de keyId */
  senderKeyId?: string
  /** JWK público del destinatario (encrypt) o remitente (decrypt) */
  externalPublicJwk?: X25519PublicJwk | Ed25519PublicJwk
  /** Alias: recipientPublicKey */
  recipientPublicKey?: X25519PublicJwk
  /** Alias: recipientKey */
  recipientKey?: X25519PublicJwk
}

/** Especificación de clave para encrypt/decrypt */
export interface EncryptDecryptKey {
  /** Presente si es cifrado asimétrico (ECDH + XSalsa20-Poly1305) */
  keyAgreement?: KeyAgreementParams
  /** Presente si es cifrado simétrico (C20P / ChaCha20-Poly1305) */
  privateJwk?: SymmetricJwk
}

/** Opciones de algoritmo para encrypt/decrypt */
export interface EncryptionOptions {
  /** 'XSALSA20-POLY1305' (key agreement) o 'C20P' / 'chacha20-poly1305' (simétrico) */
  algorithm?: string
  /** Additional Authenticated Data en base64 (solo simétrico) */
  aad?: string
}

/** Body de POST /encrypt */
export interface EncryptBody {
  key: EncryptDecryptKey
  encryption?: EncryptionOptions
  /** Datos a cifrar en base64 */
  data: string
}

/** Body de POST /decrypt */
export interface DecryptBody {
  key: EncryptDecryptKey
  encryption?: EncryptionOptions
  /** Datos cifrados en base64 */
  encrypted: string
  /** IV/nonce en base64 */
  iv?: string
  /** Auth tag en base64 */
  tag?: string
}
