import { IsOptional, IsString, IsObject } from 'class-validator'

/** DTO para POST /keys — crear una nueva clave */
export class CreateKeyDto {
  /** UUID personalizado para la clave. Si no se envía, el KMS genera uno automáticamente */
  @IsOptional()
  @IsString()
  keyId?: string

  /**
   * Descriptor del tipo de clave a crear.
   * Ed25519: { kty: 'OKP', crv: 'Ed25519' }
   * BLS:     { keyType: 'Bls12381G2' }
   * Si no se envía, se crea Ed25519 por defecto.
   */
  @IsOptional()
  @IsObject()
  type?: { kty?: string; crv?: string; keyType?: string }
}
