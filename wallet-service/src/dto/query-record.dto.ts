import { IsString, IsOptional, IsObject } from 'class-validator'

export class QueryRecordDto {
  @IsString()
  type!: string

  @IsOptional()
  @IsObject()
  query?: Record<string, unknown>
}
