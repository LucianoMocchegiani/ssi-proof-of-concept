import { IsString, IsNotEmpty } from 'class-validator'

export class ReceiveInvitationDto {
  @IsString()
  @IsNotEmpty({ message: 'invitationUrl is required' })
  invitationUrl!: string
}
