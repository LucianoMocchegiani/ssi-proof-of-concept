import { Controller, Post, Body } from '@nestjs/common'
import { InvitationService } from './invitation.service'

/**
 * Controller para recibir invitaciones OOB del issuer.
 *
 * Body: { invitationUrl }. Establece conexión DIDComm con el issuer.
 */
@Controller()
export class InvitationController {
  constructor(private readonly invitationService: InvitationService) {}

  /** Recibe URL OOB, ejecuta protocolo de conexión. Retorna outOfBandRecordId. */
  @Post('receive-invitation')
  async receive(@Body() body: { invitationUrl?: string }) {
    if (!body?.invitationUrl) return { error: 'invitationUrl required' }
    try {
      const outOfBandRecord = await this.invitationService.receiveInvitation(body.invitationUrl)
      return { ok: true, outOfBandRecordId: outOfBandRecord?.id ?? null }
    } catch (err: any) {
      return { error: err?.message ?? String(err) }
    }
  }
}

