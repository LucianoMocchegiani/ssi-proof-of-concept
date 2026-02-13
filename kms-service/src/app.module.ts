import { Module } from '@nestjs/common'
import { KmsModule } from './kms.module'

/** Módulo raíz del KMS. */
@Module({
  imports: [KmsModule],
})
export class AppModule {}

