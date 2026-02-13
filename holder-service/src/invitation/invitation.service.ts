import { Injectable } from '@nestjs/common'
import { receiveInvitation } from './invitation-credo.adapter'

/** Servicio que delega recepción de invitación OOB a Credo. */
@Injectable()
export class InvitationService {
  /** Recibe URL OOB y establece conexión DIDComm con el issuer. */
  async receiveInvitation(invitationUrl: string) {
    return receiveInvitation(invitationUrl)
  }
}
