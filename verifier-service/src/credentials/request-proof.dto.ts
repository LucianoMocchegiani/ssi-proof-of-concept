import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator'

export class RequestProofDto {
  @IsString()
  @IsNotEmpty({ message: 'connectionId is required' })
  connectionId!: string

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
