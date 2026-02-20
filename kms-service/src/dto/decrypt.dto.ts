import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'

/**
 * DTO para POST /decrypt — descifrar datos.
 *
 * Soporta dos modos:
 * 1. Key agreement (ECDH X25519 + XSalsa20-Poly1305) — key.keyAgreement presente
 * 2. Simétrico (C20P / ChaCha20-Poly1305) — key.privateJwk con kty 'oct'
 */
export class DecryptDto {
  /**
   * Especificación de la clave para descifrar:
   * - keyAgreement: { keyId, externalPublicJwk } para ECDH
   * - privateJwk: { kty: 'oct', k: '<base64url>' } para simétrico
   */
  @IsNotEmpty()
  @IsObject()
  key!: Record<string, unknown>

  /**
   * Opciones de cifrado (opcional):
   * - algorithm: 'XSALSA20-POLY1305' | 'C20P'
   * - aad: Additional Authenticated Data en base64 (solo simétrico)
   */
  @IsOptional()
  @IsObject()
  encryption?: Record<string, unknown>

  /** Datos cifrados codificados en base64 */
  @IsNotEmpty()
  @IsString()
  encrypted!: string

  /** IV/nonce codificado en base64 (12 bytes para simétrico, 24 para key agreement) */
  @IsOptional()
  @IsString()
  iv?: string

  /** Auth tag codificado en base64 (16 bytes, solo simétrico) */
  @IsOptional()
  @IsString()
  tag?: string
}
