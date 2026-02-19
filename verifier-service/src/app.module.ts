/** Módulo raíz del verifier. */
import { Module } from '@nestjs/common'
import { InvitationModule } from './invitation/invitation.module'
import { CommonModule } from './common/common.module'
import { ConnectionsModule } from './connections/connections.module'
import { CredentialsModule } from './credentials/credentials.module'

@Module({
  imports: [CommonModule, InvitationModule, ConnectionsModule, CredentialsModule],
})
export class AppModule {}

