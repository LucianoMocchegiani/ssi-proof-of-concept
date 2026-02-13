import { Controller, Post, Body, Get, Param, Delete } from '@nestjs/common'
import { KmsService } from './kms.service'

/**
 * Controller del KMS (Key Management Service).
 *
 * Expone API REST para gestión de claves: crear, obtener, importar, eliminar,
 * cifrar y descifrar. Usado por issuer, holder y verifier para operaciones
 * criptográficas sin Credo.
 */
@Controller()
export class KmsController {
  constructor(private readonly svc: KmsService) {}

  /** Health check. */
  @Get('health')
  health() {
    return { ok: true }
  }

  /** Crea un par de claves Ed25519 y lo persiste. Retorna keyId y publicJwk. */
  @Post('keys')
  async createKey(@Body() body: { keyId?: string }) {
    return this.svc.createKey(body.keyId)
  }

  /** Obtiene la clave pública por ID. Retorna null si no existe. */
  @Get('keys/:id')
  async getKey(@Param('id') id: string) {
    return this.svc.getPublicKey(id)
  }

  /** Importa una clave privada en formato JWK. */
  @Post('keys/import')
  async importKey(@Body() body: { privateJwk: any }) {
    return this.svc.importKey(body.privateJwk)
  }

  /** Elimina una clave por ID. */
  @Delete('keys/:id')
  async deleteKey(@Param('id') id: string) {
    return this.svc.deleteKey(id)
  }

  /** Genera bytes aleatorios (para nonces, etc.). */
  @Post('random')
  async random(@Body() body: { length?: number }) {
    return { random: this.svc.random(body.length || 32).toString('base64') }
  }

  /** Cifra datos (actualmente pass-through; extensible con X25519). */
  @Post('encrypt')
  async encrypt(@Body() body: any) {
    return this.svc.encrypt(body)
  }

  /** Descifra datos. */
  @Post('decrypt')
  async decrypt(@Body() body: any) {
    return this.svc.decrypt(body.encrypted)
  }
}

