import { IsNotEmpty, IsString } from 'class-validator'

/** DTO para POST /sign-bbs — firmar con clave Bls12381G2 (BBS+) */
export class SignBbsDto {
  /** UUID de la clave Bls12381G2 */
  @IsNotEmpty()
  @IsString()
  keyId!: string

  /** Datos a firmar (hash SHA-256 de N-Quads) codificados en base64 */
  @IsNotEmpty()
  @IsString()
  data!: string
}
