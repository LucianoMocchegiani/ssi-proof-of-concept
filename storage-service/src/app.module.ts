import { Module } from '@nestjs/common'
import { StorageModule } from './storage.module'

/** Módulo raíz del storage-service. */
@Module({
  imports: [StorageModule],
})
export class AppModule {}

