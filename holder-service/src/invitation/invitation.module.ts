/** Módulo de invitaciones OOB del holder. Recibe y procesa invitaciones del issuer. */
import { Module } from '@nestjs/common'
import { InvitationController } from './invitation.controller'
import { InvitationService } from './invitation.service'

@Module({
  controllers: [InvitationController],
  providers: [InvitationService],
})
export class InvitationModule {}
