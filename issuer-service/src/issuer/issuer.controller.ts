import { Controller, Get, Post, Body } from '@nestjs/common'
import { envConfig } from '../config'
import { issuerAgent } from '../agent/agent-store'

/** Controller principal del issuer. Health y /issue (POC: consulta storage). */
@Controller()
export class IssuerController {
  /** Health check. Incluye agentReady si el agente está inicializado. */
  @Get('health')
  health() {
    return { ok: true, agentReady: !!issuerAgent }
  }

  /** POC: consulta un registro por type e id en storage-service. Retorna { ok, record } o { error }. */
  @Post('issue')
  async issue(@Body() body: { type: string; id: string }) {
    // POC: simply return what would be fetched from storage
    const fetch = require('node-fetch')
    const storageUrl = envConfig.remoteStorageUrl
    const res = await fetch(`${storageUrl}/records/${encodeURIComponent(body.type)}/${encodeURIComponent(body.id)}`)
    if (!res.ok) return { error: 'not found' }
    const data = await res.json()
    return { ok: true, record: data }
  }
}

