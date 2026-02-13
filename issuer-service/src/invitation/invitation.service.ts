import { Injectable } from '@nestjs/common'
import { envConfig } from '../config'
import { createNewInvitation } from './invitation-credo.adapter'

/** Servicio que delega la creación de invitaciones OOB a Credo. */
@Injectable()
export class InvitationService {
  /** Crea invitación OOB. Usa envConfig.invitationUrlPrefix. */
  async createInvitation() {
    const { invitationUrl } = await createNewInvitation({ domain: envConfig.invitationUrlPrefix })
    return invitationUrl
  }
}
