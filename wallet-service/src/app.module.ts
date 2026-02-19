import { Module } from '@nestjs/common'
import { StorageModule } from './storage.module'

/** Módulo raíz del wallet-service. */
@Module({
  imports: [StorageModule],
})
export class AppModule {}

