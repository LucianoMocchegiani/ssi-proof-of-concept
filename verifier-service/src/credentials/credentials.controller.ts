import { Controller, Get, Post, Body } from '@nestjs/common'
import { CredentialsService } from './credentials.service'

@Controller()
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Post('request-proof')
  async requestProof(@Body() body: { connectionId: string; presentationDefinition?: any; challenge?: string; domain?: string }) {
    return this.credentialsService.requestProof({
      connectionId: body.connectionId,
      presentationDefinition: body.presentationDefinition,
      challenge: body.challenge,
      domain: body.domain,
    })
  }

  @Get('proofs')
  async getProofs() {
    return this.credentialsService.getProofs()
  }
}
