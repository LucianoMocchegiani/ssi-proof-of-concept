import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common'
import { CredentialsService } from './credentials.service'

/**
 * Holder: proposeCredential, listCredentials.
 */
@Controller()
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Post('propose-credential')
  async proposeCredential(
    @Body()
    body: {
      connectionId: string
      credentialSubject: Record<string, unknown>
      type?: string[]
    }
  ) {
    if (!body.connectionId) {
      throw new BadRequestException('connectionId required. Run GET /connections (3a) first and use the holder connection id.')
    }
    const result = await this.credentialsService.proposeCredential({
      connectionId: body.connectionId,
      credentialSubject: body.credentialSubject ?? {},
      type: body.type,
    })
    if ('error' in result) {
      throw new BadRequestException(result.error)
    }
    return result
  }

  @Get('credentials')
  async listCredentials() {
    return this.credentialsService.listCredentials()
  }
}
