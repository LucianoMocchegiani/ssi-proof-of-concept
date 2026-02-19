import { Controller, Get } from '@nestjs/common'
import { holderAgent } from '../agent/agent-store'

/** Health común. */
@Controller()
export class CommonController {
  @Get('health')
  health() {
    return { ok: true, agentReady: !!holderAgent }
  }
}
