/** Módulo raíz del issuer. Incluye Invitation e Issuer. */
import { Module } from '@nestjs/common'
import { IssuerController } from './issuer/issuer.controller'
import { InvitationModule } from './invitation/invitation.module'

@Module({
  imports: [InvitationModule],
  controllers: [IssuerController],
})
export class AppModule {}

