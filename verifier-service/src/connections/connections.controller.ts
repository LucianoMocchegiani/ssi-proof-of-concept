import { Controller, Get } from '@nestjs/common'
import { ConnectionsService } from './connections.service'

@Controller()
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get('connections')
  async connections() {
    return this.connectionsService.getConnections()
  }
}
