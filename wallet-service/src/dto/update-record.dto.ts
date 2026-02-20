import { IsObject } from 'class-validator'

export class UpdateRecordDto {
  @IsObject()
  data!: Record<string, unknown>
}
