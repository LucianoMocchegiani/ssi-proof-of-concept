import { Controller, Post, Body, BadRequestException } from '@nestjs/common'
import { CredentialsService } from './credentials.service'

/**
 * Issuer: offerCredential (emisión de credenciales).
 */
@Controller()
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Post('offer-credential')
  async offerCredential(
    @Body()
    body: {
      connectionId: string
      credential: {
        '@context'?: string[]
        credentialSubject: Record<string, unknown>
        type?: string[]
      }
      proofType?: string
    }
  ) {
    if (!body.connectionId) {
      throw new BadRequestException('connectionId required. Run GET /connections (3b) first.')
    }
    const result = await this.credentialsService.offerCredential({
      connectionId: body.connectionId,
      credential: body.credential,
      proofType: body.proofType,
    })
    if ('error' in result) {
      throw new BadRequestException(result.error)
    }
    return result
  }
}
