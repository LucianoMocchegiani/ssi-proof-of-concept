import { Controller, Get, Post, Body } from '@nestjs/common'
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
}
