import { Controller, Post, Body } from '@nestjs/common'
import { CredentialsService, type RevokeResult } from './credentials.service'
import { CredentialExchangeDto } from './credential-exchange.dto'
import { RevokeCredentialDto } from './revoke-credential.dto'

@Controller()
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Post('offer-credential')
  async offerCredential(@Body() body: CredentialExchangeDto) {
    return this.credentialsService.offerCredential(body)
  }

  /** Revoca una credencial por su credentialId (urn:uuid:...). */
  @Post('revoke-credential')
  async revokeCredential(@Body() body: RevokeCredentialDto): Promise<RevokeResult> {
    return this.credentialsService.revokeCredential(body.credentialId)
  }
}
