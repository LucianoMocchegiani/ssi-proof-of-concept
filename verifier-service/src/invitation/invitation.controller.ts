import { Controller, Post } from '@nestjs/common'
import { InvitationService } from './invitation.service'

/**
 * Controller de invitaciones OOB del verifier.
 * Crea invitaciones para conexión con holder.
 */
@Controller()
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  /** Crea invitación OOB. Sin body. Usa envConfig.invitationUrlPrefix. */
  @Post('create-invitation')
  async createVerifierInvitation() {
    const invitationUrl = await this.invitationService.createInvitation()
    return { invitation: invitationUrl }
  }
}

