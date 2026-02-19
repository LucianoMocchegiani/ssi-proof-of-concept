import { Controller, Get } from '@nestjs/common'
import { verifierAgent } from '../agent/agent-store'

/** Health común. */
@Controller()
export class CommonController {
  @Get('health')
  health() {
    return { ok: true, agentReady: !!verifierAgent }
  }
}
