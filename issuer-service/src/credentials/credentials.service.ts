import { Injectable, Logger } from '@nestjs/common'
import { offerCredential, revokeCredential } from '@one/credo'
import { issuerAgent } from '../agent/agent-store'
import { getIssuerDid } from '../agent/issuer-did-store'
import { getStatusList } from '../agent/issuer-status-list-store'
import { envConfig } from '../config'
import type { CredentialExchangeDto } from './credential-exchange.dto'

/** Resultado de una operación de revocación */
export interface RevokeResult {
  ok: boolean
  credentialId: string
  statusListId: string
  statusListIndex: number
}

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name)

  async offerCredential(
    params: CredentialExchangeDto,
  ): Promise<{ credentialExchangeId: string; state: string; credentialId: string; statusListIndex?: number } | { error: string }> {
    return offerCredential(issuerAgent, params, {
      vdrServiceUrl: envConfig.vdrServiceUrl,
      getIssuerDid,
      getStatusList,
    })
  }

  async revokeCredential(credentialId: string): Promise<RevokeResult> {
    const result = await revokeCredential(envConfig.vdrServiceUrl, credentialId)
    this.logger.log(`Credential revoked: ${credentialId} (list=${result.statusListId} index=${result.statusListIndex})`)
    return result
  }
}
