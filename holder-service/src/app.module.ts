/** Módulo raíz del holder. Incluye Invitation y Holder. */
import { Module } from '@nestjs/common'
import { HolderController } from './holder/holder.controller'
import { InvitationModule } from './invitation/invitation.module'

@Module({
  imports: [InvitationModule],
  controllers: [HolderController],
})
export class AppModule {}

