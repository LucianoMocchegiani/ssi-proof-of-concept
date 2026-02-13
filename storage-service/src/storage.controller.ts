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
    const q = body.query
    if (q?.id && !items.some((r: { id: string }) => r.id === q.id)) {
      // eslint-disable-next-line no-console
      console.warn('[storage] query miss by id', { type: body.type, queryId: q.id, existingIds: items.map((r: { id: string }) => r.id) })
    }
    return items
  }
}
