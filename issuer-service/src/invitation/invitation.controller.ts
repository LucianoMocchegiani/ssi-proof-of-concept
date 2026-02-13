import { Controller, Post, HttpException, HttpStatus } from '@nestjs/common'
import { InvitationService } from './invitation.service'

/**
 * Controller de invitaciones OOB del issuer.
 *
 * Crea invitaciones que el holder usa para establecer conexión DIDComm.
 */
@Controller()
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  /** Crea invitación OOB. */
  @Post('create-invitation')
  async createInvitation() {
    try {
      const invitationUrl = await this.invitationService.createInvitation()
      return { invitation: invitationUrl }
    } catch (err: any) {
      const message = err?.message ?? String(err)
      throw new HttpException(
        { error: message, details: err?.cause ?? err?.stack },
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}

