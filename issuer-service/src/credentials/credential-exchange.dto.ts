import { Type } from 'class-transformer'
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsObject,
} from 'class-validator'

export class CredentialSubjectDto {
  @IsOptional()
  @IsString()
  id?: string;

  [key: string]: unknown
}

export class CredentialDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  '@context'?: string[]

  @ValidateNested()
  @Type(() => CredentialSubjectDto)
  @IsObject()
  credentialSubject!: CredentialSubjectDto

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  type?: string[]
}

export class CredentialExchangeDto {
  @IsString()
  @IsNotEmpty({ message: 'connectionId is required' })
  connectionId!: string

  @ValidateNested()
  @Type(() => CredentialDto)
  @IsObject()
  credential!: CredentialDto

  @IsOptional()
  @IsString()
  proofType?: string
}
