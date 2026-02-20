import { Controller, Get, Post, Put, Delete, Body, Param, NotFoundException } from '@nestjs/common'
import { StorageService } from './storage.service'
import { SaveRecordDto, UpdateRecordDto, UpdateRecordBodyDto, GetRecordDto, DeleteRecordDto, QueryRecordDto } from './dto'
import type { RecordData, RecordItem, SaveResult, OkResult } from './types/record.types'

@Controller()
export class StorageController {
  constructor(private readonly svc: StorageService) {}

  @Get('health')
  health(): { ok: true } {
    return { ok: true }
  }

  @Post('records')
  async save(@Body() body: SaveRecordDto): Promise<SaveResult> {
    return this.svc.save(body.type, body.id, body.data as RecordData)
  }

  @Get('records/:type/:id')
  async getByIdRoute(@Param('type') type: string, @Param('id') id: string): Promise<RecordData> {
    const data = await this.svc.getById(type, id)
    if (!data) throw new NotFoundException('not found')
    return data
  }

  @Get('records/:type')
  async getAll(@Param('type') type: string): Promise<RecordItem[]> {
    return this.svc.getAll(type)
  }

  @Put('records/:type/:id')
  async update(
    @Param('type') type: string,
    @Param('id') id: string,
    @Body() body: UpdateRecordDto,
  ): Promise<OkResult> {
    return this.svc.update(type, id, body.data as RecordData)
  }

  @Delete('records/:type/:id')
  async delete(@Param('type') type: string, @Param('id') id: string): Promise<OkResult> {
    return this.svc.delete(type, id)
  }

  /** POST alternativo para IDs largos (ej. did:peer:4...) que exceden límites de URL. */
  @Post('records/get')
  async getByBody(@Body() body: GetRecordDto): Promise<RecordData> {
    const data = await this.svc.getById(body.type, body.id)
    if (!data) {
      const ids = await this.svc.getIdsByType(body.type)
      console.warn('[storage] getById miss', { type: body.type, id: body.id, existingIds: ids })
      throw new NotFoundException('not found')
    }
    return data
  }

  @Post('records/update')
  async updateByBody(@Body() body: UpdateRecordBodyDto): Promise<OkResult> {
    return this.svc.update(body.type, body.id, body.data as RecordData)
  }

  @Post('records/delete')
  async deleteByBody(@Body() body: DeleteRecordDto): Promise<OkResult> {
    return this.svc.delete(body.type, body.id)
  }

  /**
   * Query por type. Retorna todos los registros del type.
   * El filtrado fino lo hace el adapter del lado del agente (filterByQuery).
   */
  @Post('records/query')
  async query(@Body() body: QueryRecordDto): Promise<RecordItem[]> {
    return this.svc.query(body.type)
  }

  @Get('debug/oob-invitations')
  async debugOobInvitations() {
    const type = 'issuer-wallet::OutOfBandRecord'
    const items = await this.svc.getAll(type)
    return items.map(({ id, data }) => {
      const inv = data?.outOfBandInvitation
      const tags = data?.tags ?? data?._tags
      const invId = inv?.['@id'] ?? inv?.id ?? tags?.invitationId ?? '-'
      return { recordId: id, invitationId: invId, role: data?.role ?? '-' }
    })
  }

  @Get('debug/did-keys')
  async debugDidKeys() {
    const wallets = ['issuer-wallet', 'holder-wallet', 'verifier-wallet']
    const result: Record<string, Array<{ id: string; did: string; kmsKeyIds: string[] }>> = {}
    for (const w of wallets) {
      const type = `${w}::DidRecord`
      const items = await this.svc.getAll(type)
      result[w] = items.map(({ id, data }) => ({
        id,
        did: (data?.did as string) ?? (data?.id as string) ?? '-',
        kmsKeyIds: (data?.keys ?? []).map((k) => k.kmsKeyId).filter((k): k is string => !!k),
      }))
    }
    return result
  }
}
