/** Modulo StatusList para revocacion de credenciales W3C (Bitstring Status List 2021). */
import { Module } from '@nestjs/common'
import { StatusController } from './status.controller'
import { StatusService } from './status.service'

@Module({
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
