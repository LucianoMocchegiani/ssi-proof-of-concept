/** Controller REST del KMS. Expone endpoints para createKey, getPublicKey, sign, verify, etc. */
import { Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus, NotFoundException } from '@nestjs/common'
import { KmsService } from './kms.service'

@Controller()
export class KmsController {
  constructor(private readonly kms: KmsService) {}

  @Get('health')
  health() {
    return { status: 'ok' }
  }

  /** DEBUG: Lista claves con thumbprints. Comparar tpX25519 con el kid del JWE (ej. 58tLSzsbw...). */
  @Get('keys-debug')
  async listKeysDebug() {
    return this.kms.listKeysDebug()
  }

  @Post('keys')
  async createKey(@Body() body: { keyId?: string; type?: { kty?: string; crv?: string } }) {
    const type =
      body.type?.kty === 'OKP' && body.type?.crv === 'Ed25519' ? 'Ed25519' :
      (body.type as any)?.keyType === 'Bls12381G2' ? 'Bls12381G2' : 'Ed25519'
    return this.kms.createKey(body.keyId, type)
  }

  @Get('keys/:id')
  async getPublicKey(@Param('id') id: string) {
    const pk = await this.kms.getPublicKey(id)
    if (!pk) {
      console.error('[kms] getPublicKey NOT FOUND:', id.substring(0, 50) + (id.length > 50 ? '...' : ''))
      throw new NotFoundException(`Key ${id} not found`)
    }
    return pk
  }

  @Post('keys/import')
  async importKey(@Body() body: { privateJwk: any }) {
    return this.kms.importKey(body.privateJwk)
  }

  @Delete('keys/:id')
  async deleteKey(@Param('id') id: string) {
    await this.kms.deleteKey(id)
    return { deleted: id }
  }

  @Post('random')
  random(@Body() body: { length?: number }) {
    const len = body?.length ?? 32
    return { random: this.kms.random(len).toString('base64') }
  }

  @Post('sign')
  @HttpCode(HttpStatus.OK)
  async sign(@Body() body: { keyId: string; data: string }) {
    const sig = await this.kms.sign(body.keyId, body.data)
    return { signature: sig }
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: { keyId: string; data: string; signature: string }) {
    const valid = await this.kms.verify(body.keyId, body.data, body.signature)
    return { valid }
  }

  @Post('encrypt')
  async encrypt(@Body() body: any) {
    return this.kms.encrypt(body)
  }

  @Post('decrypt')
  async decrypt(@Body() body: any) {
    return this.kms.decrypt(body)
  }

  @Post('sign-bbs')
  @HttpCode(HttpStatus.OK)
  async signBbs(@Body() body: { keyId: string; data: string }) {
    const data = typeof body.data === 'string' ? body.data : Buffer.from(body.data).toString('base64')
    const sig = await this.kms.signBbs(body.keyId, data)
    return { signature: sig }
  }
}
