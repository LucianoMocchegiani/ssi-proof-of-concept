import { IsNotEmpty, IsString } from 'class-validator'

/** DTO para POST /verify — verificar firma Ed25519 */
export class VerifyDto {
  /** UUID, thumbprint o multibase fingerprint de la clave Ed25519 */
  @IsNotEmpty()
  @IsString()
  keyId!: string

  /** Datos originales codificados en base64 */
  @IsNotEmpty()
  @IsString()
  data!: string

  /** Firma a verificar codificada en base64 */
  @IsNotEmpty()
  @IsString()
  signature!: string
}
