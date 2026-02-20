import { IsNotEmpty, IsString } from 'class-validator'

/** DTO para POST /revoke-credential — revocar una credencial por su credentialId. */
export class RevokeCredentialDto {
  /** ID de la credencial (urn:uuid:...) tal como aparece en el campo "id" de la VC */
  @IsNotEmpty({ message: 'credentialId is required' })
  @IsString()
  credentialId!: string
}
