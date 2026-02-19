import { Controller, Post, Body } from '@nestjs/common'
import { CredentialsService } from './credentials.service'
import { CredentialExchangeDto } from './credential-exchange.dto'

@Controller()
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Post('offer-credential')
  async offerCredential(@Body() body: CredentialExchangeDto) {
    return this.credentialsService.offerCredential(body)
  }
}
