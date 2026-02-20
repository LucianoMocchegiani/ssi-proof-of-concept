import { IsNotEmpty, IsString } from 'class-validator'

/** DTO para POST /sign — firmar datos con Ed25519 */
export class SignDto {
  /** UUID, thumbprint o multibase fingerprint de la clave Ed25519 */
  @IsNotEmpty()
  @IsString()
  keyId!: string

  /** Datos a firmar codificados en base64 */
  @IsNotEmpty()
  @IsString()
  data!: string
}
