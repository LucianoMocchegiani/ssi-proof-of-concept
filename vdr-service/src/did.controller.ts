import { Controller, Get, Post, Body, Param, NotFoundException, BadRequestException, Header } from '@nestjs/common'
import { DidService } from './did.service'

/**
 * Controller de DIDs did:custom.
 *
 * Registro y resolución. Los agentes usan CustomDidResolver/CustomDidRegistrar
 * para consultar y registrar DIDs.
 */
@Controller()
export class DidController {
  constructor(private readonly svc: DidService) {}

  @Get('health')
  health() {
    return { ok: true }
  }

  /** Registra un DID Document. Body: { id, document }. */
  @Post('did')
  async register(@Body() body: { id: string; document: object }) {
    const { id, document } = body
    if (!id || !document) {
      throw new BadRequestException('id and document required')
    }
    return this.svc.save(id, document)
  }

  /** Elimina un DID Document. Body: { id }. Para limpiar DIDs huérfanos (clave perdida en MockKMS). */
  @Post('did/delete')
  async deleteDid(@Body() body: { id: string }) {
    const id = body?.id
    if (!id) throw new BadRequestException('id required')
    return this.svc.deleteById(id)
  }

  /** Resuelve un DID. Retorna el DID Document. 404 si no existe. */
  @Get('did/:id')
  async resolve(@Param('id') id: string) {
    const doc = await this.svc.getById(id)
    if (!doc) throw new NotFoundException('not found')
    return doc
  }

  /** DID Document en formato did+json (endpoint did.json). */
  @Get(':id/did.json')
  @Header('Content-Type', 'application/did+json')
  async resolveWebFormat(@Param('id') id: string) {
    const doc = await this.svc.getById(id)
    if (!doc) throw new NotFoundException('not found')
    return doc
  }
}
