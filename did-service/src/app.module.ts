/** Módulo raíz del DID service. */
import { Module } from '@nestjs/common'
import { DidModule } from './did.module'

@Module({
  imports: [DidModule],
})
export class AppModule {}
