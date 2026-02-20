import { IsString, IsObject } from 'class-validator'

export class UpdateRecordBodyDto {
  @IsString()
  type!: string

  @IsString()
  id!: string

  @IsObject()
  data!: Record<string, unknown>
}
