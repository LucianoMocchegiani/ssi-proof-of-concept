import { Controller, Get, Param, BadRequestException } from '@nestjs/common'
import { ConnectionsService } from './connections.service'

@Controller()
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get('connections')
  async connections() {
    return this.connectionsService.getConnections()
  }

  @Get('connection/:id')
  async getConnection(@Param('id') id: string) {
    const result = await this.connectionsService.getConnection(id)
    if ('error' in result) throw new BadRequestException(result.error)
    return result
  }
}
