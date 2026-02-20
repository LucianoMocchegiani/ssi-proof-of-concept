import { IsString } from 'class-validator'

export class GetRecordDto {
  @IsString()
  type!: string

  @IsString()
  id!: string
}
