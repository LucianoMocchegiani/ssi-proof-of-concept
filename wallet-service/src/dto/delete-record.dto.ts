import { IsString } from 'class-validator'

export class DeleteRecordDto {
  @IsString()
  type!: string

  @IsString()
  id!: string
}
