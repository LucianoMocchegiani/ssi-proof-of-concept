/** Módulo KMS. Expone controller y service de gestión de claves. */
import { Module } from '@nestjs/common'
import { KmsController } from './kms.controller'
import { KmsService } from './kms.service'

@Module({
  controllers: [KmsController],
  providers: [KmsService],
  exports: [KmsService],
})
export class KmsModule {}

