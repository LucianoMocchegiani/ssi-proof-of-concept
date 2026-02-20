import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator'

/**
 * DTO para POST /encrypt — cifrar datos.
 *
 * Soporta dos modos:
 * 1. Key agreement (ECDH X25519 + XSalsa20-Poly1305) — key.keyAgreement presente
 * 2. Simétrico (C20P / ChaCha20-Poly1305) — key.privateJwk con kty 'oct'
 */
export class EncryptDto {
  /**
   * Especificación de la clave para cifrar:
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

  /** Datos a cifrar codificados en base64 */
  @IsNotEmpty()
  @IsString()
  data!: string
}
