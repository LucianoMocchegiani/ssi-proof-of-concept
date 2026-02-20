import { Controller, Get, Post, Body, Param, NotFoundException, BadRequestException } from '@nestjs/common'
import { StatusService } from './status.service'

/**
 * Controller de StatusList (Bitstring Status List 2021).
 *
 * Endpoints para crear listas, obtener bitstring y revocar indices.
 * Usado por issuer (crear, revocar) y verifier (obtener, verificar).
 */
@Controller('status')
export class StatusController {
  constructor(private readonly svc: StatusService) {}

  /**
   * Crea una nueva StatusList.
   * Body: { issuerId }
   * Retorna: { id, url }
   */
  @Post('list')
  async createList(@Body() body: { issuerId?: string }) {
    const issuerId = body?.issuerId || 'default'
    return this.svc.createList(issuerId)
  }

  /**
   * Obtiene la StatusList en formato para verifier.
   * Segun Bitstring Status List spec, el verifier necesita el encodedList para verificar el bit.
   * Retorna JSON con encodedList y size.
   */
  @Get('list/:id')
  async getList(@Param('id') id: string) {
    const list = await this.svc.getList(id)
    if (!list) throw new NotFoundException('StatusList not found')
    return list
  }

  /**
   * Asigna el siguiente indice libre para una nueva credencial.
   * Retorna { statusListIndex } para usar en credentialStatus.
   */
  @Post('list/:id/allocate')
  async allocateIndex(@Param('id') id: string) {
    const index = await this.svc.allocateIndex(id)
    return { statusListIndex: index }
  }

  /**
   * Verifica si un indice esta revocado por listId + index (bajo nivel / debug).
   * Para consultar por credentialId, usar GET /status/credential/:id/revoked.
   */
  @Get('revoked/:listId/:index')
  async isRevoked(@Param('listId') listId: string, @Param('index') index: string) {
    const idx = parseInt(index, 10)
    if (isNaN(idx) || idx < 0) throw new BadRequestException('Invalid index')
    const revoked = await this.svc.isRevoked(listId, idx)
    return { revoked }
  }

  /**
   * Marca un indice como revocado.
   * Body: { statusListIndex: number }
   */
  @Post('list/:id/revoke')
  async revoke(@Param('id') id: string, @Body() body: { statusListIndex?: number }) {
    const index = body?.statusListIndex
    if (typeof index !== 'number' || index < 0) {
      throw new BadRequestException('statusListIndex (number >= 0) required')
    }
    await this.svc.revoke(id, index)
    return { ok: true, revoked: index }
  }

  /**
   * Registra el mapeo credentialId → (statusListId, statusListIndex).
   * El issuer llama a esto al emitir una credencial, ya que Credo no soporta
   * credentialStatus embebido en JSON-LD.
   */
  @Post('credential-map')
  async registerMapping(@Body() body: { credentialId?: string; statusListId?: string; statusListIndex?: number }) {
    if (!body?.credentialId || !body?.statusListId || typeof body?.statusListIndex !== 'number') {
      throw new BadRequestException('credentialId, statusListId, statusListIndex required')
    }
    await this.svc.registerCredentialMapping(body.credentialId, body.statusListId, body.statusListIndex)
    return { ok: true }
  }

  /**
   * Consulta el estado de revocación de una credencial por su ID (urn:uuid:xxx).
   * Retorna { revoked, statusListId, statusListIndex } o 404 si no hay mapeo.
   */
  @Get('credential/:credentialId/revoked')
  async isCredentialRevoked(@Param('credentialId') credentialId: string) {
    const result = await this.svc.isCredentialRevoked(credentialId)
    if (!result) throw new NotFoundException(`No revocation mapping found for credential ${credentialId}`)
    return result
  }
}
