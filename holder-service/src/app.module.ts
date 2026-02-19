/** Módulo raíz del holder. */
import { Module } from '@nestjs/common'
import { InvitationModule } from './invitation/invitation.module'
import { ConnectionsModule } from './connections/connections.module'
import { CredentialsModule } from './credentials/credentials.module'
import { CommonModule } from './common/common.module'

@Module({
  imports: [CommonModule, InvitationModule, ConnectionsModule, CredentialsModule],
})
export class AppModule {}

