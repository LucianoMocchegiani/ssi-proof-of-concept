import { Controller, Get, Post, Body } from '@nestjs/common'
import { CredentialsService } from './credentials.service'
import { RequestProofDto } from './request-proof.dto'

@Controller()
export class CredentialsController {
  constructor(private readonly credentialsService: CredentialsService) {}

  @Post('request-proof')
  async requestProof(@Body() body: RequestProofDto) {
    return this.credentialsService.requestProof(body)
  }

  @Get('proofs')
  async getProofs() {
    return this.credentialsService.getProofs()
  }
}
