import { Controller, Post, Body } from '@nestjs/common'
import { InvitationService } from './invitation.service'
import { ReceiveInvitationDto } from './receive-invitation.dto'

@Controller()
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  @Post('receive-invitation')
  async receive(@Body() body: ReceiveInvitationDto) {
    try {
      const outOfBandRecord = await this.invitationService.receiveInvitation(body.invitationUrl)
      return { ok: true, outOfBandRecordId: outOfBandRecord?.id ?? null }
    } catch (err: any) {
      return { error: err?.message ?? String(err) }
    }
  }
}
