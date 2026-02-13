import { Controller, Get, Post, Body } from '@nestjs/common'
import { envConfig } from '../config'

/** Controller del holder. Endpoint /holder para consultar registros en storage. */
@Controller()
export class HolderController {
  /** Health check. */
  @Get('health')
  health() {
    return { ok: true }
  }

  /** Consulta un registro por type e id en storage-service. Retorna { ok, record } o { error }. */
  @Post('holder')
  async holder(@Body() body: { type: string; id: string }) {
    const storageUrl = envConfig.remoteStorageUrl
    const res = await fetch(`${storageUrl}/records/${encodeURIComponent(body.type)}/${encodeURIComponent(body.id)}`)
    if (!res.ok) return { error: 'not found' }
    const data = await res.json()
    return { ok: true, record: data }
  }
}

