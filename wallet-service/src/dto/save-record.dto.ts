import { IsString, IsOptional, IsObject } from 'class-validator'

export class SaveRecordDto {
  @IsString()
  type!: string

  @IsOptional()
  @IsString()
  id?: string

  @IsObject()
  data!: Record<string, unknown>
}
