/** Módulo raíz del verifier. Incluye Invitation y Verify. */
import { Module } from '@nestjs/common'
import { VerifyController } from './verify/verify.controller'
import { InvitationModule } from './invitation/invitation.module'

@Module({
  imports: [InvitationModule],
  controllers: [VerifyController],
})
export class AppModule {}

