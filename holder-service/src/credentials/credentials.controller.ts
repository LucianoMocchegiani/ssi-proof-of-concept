import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { CredentialsService } from './credentials.service'
import { CredentialExchangeDto } from './credential-exchange.dto'

@Controller()
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Post('propose-credential')
  async proposeCredential(@Body() body: CredentialExchangeDto) {
    return this.credentialsService.proposeCredential(body)
  }

  @Get('credentials')
  async listCredentials() {
    return this.credentialsService.listCredentials()
  }

  /** Lista todas las credenciales con su estado de revocación (revoked: true/false/null). */
  @Get('credentials-status')
  async listCredentialsWithStatus() {
    return this.credentialsService.listCredentialsWithStatus()
  }

  /** Consulta si una credencial específica fue revocada (por su id, ej: urn:uuid:xxx). */
  @Get('credential-status/:id')
  async checkCredentialStatus(@Param('id') id: string) {
    return this.credentialsService.checkCredentialStatus(id)
  }
}
