import { IsString, IsNotEmpty, IsOptional, IsObject, IsInt, Min } from 'class-validator'

export class RequestProofDto {
  @IsString()
  @IsNotEmpty({ message: 'connectionId is required' })
  connectionId!: string

  /**
   * Cantidad exacta de credenciales a solicitar.
   * Si no se envía, el verifier pide "todas las que el holder tenga" (mode: all).
   * Si se envía, se generan exactamente N descriptores obligatorios.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  credentialCount?: number

  /** Presentation Definition PEX personalizada. Si se pasa, ignora credentialCount. */
  @IsOptional()
  @IsObject()
  presentationDefinition?: Record<string, unknown>

  @IsOptional()
  @IsString()
  challenge?: string

  @IsOptional()
  @IsString()
  domain?: string
}
