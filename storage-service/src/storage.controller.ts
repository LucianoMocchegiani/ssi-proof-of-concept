import { Controller, Get, Post, Put, Delete, Body, Param, NotFoundException } from '@nestjs/common'
import { StorageService } from './storage.service'

/**
 * Controller de almacenamiento genérico.
 *
 * CRUD de registros por (type, id). Los agentes Credo usan scope
 * walletId::RecordType (ej. issuer-wallet::ConnectionRecord).
 */
@Controller()
export class StorageController {
  constructor(private readonly svc: StorageService) {}

  @Get('health')
  health() {
    return { ok: true }
  }

  /** Guarda registro. type+id es la clave. data es JSON. Retorna { id }. */
  @Post('records')
  async save(@Body() body: { type: string; id?: string; data: any }) {
    const { type, id, data } = body
    if (type?.includes('DidRecord')) {
      // eslint-disable-next-line no-console
      console.log('[storage] save DidRecord', { type, id: id?.slice(0, 50) })
    }
    if (type?.includes('OutOfBandRecord')) {
      const inv = data?.outOfBandInvitation
      const invId = inv?.['@id'] ?? inv?.id ?? data?.invitationId
      // eslint-disable-next-line no-console
      console.log('[storage] save OutOfBandRecord', { type, recordId: id?.slice(0, 36), invitationId: invId })
    }
    const result = await this.svc.save(type, id, data)
    return result
  }

  /** Obtiene un registro. 404 si no existe. */
  @Get('records/:type/:id')
  async getByIdRoute(@Param('type') type: string, @Param('id') id: string) {
    if (type?.includes('DidRecord')) {
      // eslint-disable-next-line no-console
      console.log('[storage] GET DidRecord', { type, id: id?.slice(0, 50) })
    }
    const data = await this.svc.getById(type, id)
    if (!data) throw new NotFoundException('not found')
    return data
  }

  /** Lista todos los registros de un type. Retorna [{ id, data }]. */
  @Get('records/:type')
  async getAll(@Param('type') type: string) {
    return this.svc.getAll(type)
  }

  /** Actualiza el data de un registro existente. */
  @Put('records/:type/:id')
  async update(@Param('type') type: string, @Param('id') id: string, @Body() body: { data: any }) {
    await this.svc.update(type, id, body.data)
    return { ok: true }
  }

  /** Elimina un registro. */
  @Delete('records/:type/:id')
  async delete(@Param('type') type: string, @Param('id') id: string) {
    await this.svc.delete(type, id)
    return { ok: true }
  }

  /** Obtiene un registro por type e id (body). Para IDs largos como did:peer:4 que exceden límites de URL. */
  @Post('records/get')
  async getByBody(@Body() body: { type: string; id: string }) {
    const { type, id } = body
    const data = await this.svc.getById(type, id)
    // eslint-disable-next-line no-console
    console.log('[storage] getById', { type, id: id?.slice(0, 50), found: !!data })
    if (!data) {
      const ids = await this.svc.getIdsByType(type)
      // eslint-disable-next-line no-console
      console.warn('[storage] getById miss', { type, id, existingIds: ids })
      throw new NotFoundException('not found')
    }
    return data
  }

  /** Actualiza por body. Para IDs largos. */
  @Post('records/update')
  async updateByBody(@Body() body: { type: string; id: string; data: any }) {
    const { type, id, data } = body
    await this.svc.update(type, id, data)
    return { ok: true }
  }

  /** Elimina por body. Para IDs largos. */
  @Post('records/delete')
  async deleteByBody(@Body() body: { type: string; id: string }) {
    const { type, id } = body
    await this.svc.delete(type, id)
    return { ok: true }
  }

  /** Query por type. Retorna todos los registros del type. */
  @Post('records/query')
  async query(@Body() body: { type: string; query?: any }) {
    const items = await this.svc.query(body.type)
    // Debug: loguear queries de DidRecord
    if (body.type?.includes('DidRecord')) {
      // eslint-disable-next-line no-console
      console.log('[storage] query DidRecord', { type: body.type, query: body.query, count: items.length })
    }
    if (body.type?.includes('OutOfBandRecord') && body.query?.invitationId) {
      const invIds = (items as { id: string; data: any }[]).map((r) => {
        const inv = r.data?.outOfBandInvitation
        return inv?.['@id'] ?? inv?.id ?? r.data?.invitationId ?? '-'
      })
      // eslint-disable-next-line no-console
      console.log('[storage] query OutOfBandRecord by invitationId', { invitationId: body.query.invitationId, count: items.length, storedInvIds: invIds })
    }
    const q = body.query
    if (q?.id && !items.some((r: { id: string }) => r.id === q.id)) {
      // eslint-disable-next-line no-console
      console.warn('[storage] query miss by id', { type: body.type, queryId: q.id, existingIds: items.map((r: { id: string }) => r.id) })
    }
    return items
  }

  /**
   * DEBUG: Lista OutOfBandRecords del issuer con invitation ids.
   * Para verificar que create-invitation guardó correctamente.
   */
  @Get('debug/oob-invitations')
  async debugOobInvitations() {
    const type = 'issuer-wallet::OutOfBandRecord'
    const items = (await this.svc.getAll(type)) as { id: string; data: any }[]
    return items.map(({ id, data }) => {
      const inv = data?.outOfBandInvitation
      const invId = inv?.['@id'] ?? inv?.id ?? (data?.tags ?? data?._tags)?.invitationId ?? '-'
      return { recordId: id, invitationId: invId, role: data?.role ?? '-' }
    })
  }

  /**
   * DEBUG: Lista DidRecords de issuer, holder y verifier con sus kmsKeyIds.
   * Útil para cruzar con GET /keys-debug del KMS y ver si las claves existen.
   */
  @Get('debug/did-keys')
  async debugDidKeys() {
    const wallets = ['issuer-wallet', 'holder-wallet', 'verifier-wallet']
    const result: Record<string, Array<{ did: string; kmsKeyIds: string[] }>> = {}
    for (const w of wallets) {
      const type = `${w}::DidRecord`
      const items = await this.svc.getAll(type)
      result[w] = (items as { id: string; data: any }[]).map(({ id, data }) => ({
        id,
        did: data?.did ?? data?.id ?? '-',
        kmsKeyIds: (data?.keys ?? []).map((k: { kmsKeyId?: string }) => k.kmsKeyId).filter(Boolean),
      }))
    }
    return result
  }
}
