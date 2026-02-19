/** Modulo raiz del VDR service. */
import { Module } from '@nestjs/common'
import { DidModule } from './did.module'
import { StatusModule } from './status/status.module'

@Module({
  imports: [DidModule, StatusModule],
})
export class AppModule {}
