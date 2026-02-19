import { Controller, Get } from '@nestjs/common'
import { envConfig } from '../config'
import { issuerAgent } from '../agent/agent-store'
import { getIssuerDid } from '../agent/issuer-did-store'

/** Health y debug comunes. */
@Controller()
export class CommonController {
  @Get('health')
  health() {
    return { ok: true, agentReady: !!issuerAgent }
  }

  @Get('debug')
  debug() {
    let did: string | null = null
    try {
      did = getIssuerDid()
    } catch {
      // agent not ready
    }
    return {
      did,
      didcommEndpoint: envConfig.didcommEndpoint,
      hint: 'El holder resuelve el DID del issuer desde VDR y conecta a este endpoint por WebSocket. Con Docker: ws://issuer-service:3000.',
    }
  }
}
