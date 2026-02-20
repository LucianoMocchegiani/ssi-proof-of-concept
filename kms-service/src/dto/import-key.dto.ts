import { IsNotEmpty, IsObject } from 'class-validator'
import type { ImportablePrivateJwk } from '../types'

/** DTO para POST /keys/import — importar una clave privada JWK existente */
export class ImportKeyDto {
  /**
   * JWK privado a importar. Debe contener al menos kty, crv, x y d.
   * El KMS deriva la clave pública eliminando el campo 'd'.
   */
  @IsNotEmpty()
  @IsObject()
  privateJwk!: ImportablePrivateJwk
}
