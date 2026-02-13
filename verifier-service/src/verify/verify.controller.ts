import { Controller, Get, Post, Body } from '@nestjs/common'
import { envConfig } from '../config'

/** Controller de verificación. Endpoint /verify para consultar registros en storage-service. */
@Controller()
export class VerifyController {
  /** Health check. */
  @Get('health')
  health() {
    return { ok: true }
  }

  /** Consulta un registro por type e id en storage-service. Retorna { ok, record } o { error }. */
  @Post('verify')
  async verify(@Body() body: { type: string; id: string }) {
    const storageUrl = envConfig.remoteStorageUrl
    const res = await fetch(`${storageUrl}/records/${encodeURIComponent(body.type)}/${encodeURIComponent(body.id)}`)
    if (!res.ok) return { error: 'not found' }
    const data = await res.json()
    return { ok: true, record: data }
  }
}

