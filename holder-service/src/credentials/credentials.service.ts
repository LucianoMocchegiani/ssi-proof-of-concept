import { Injectable, Logger } from '@nestjs/common'
import { proposeCredential, toCredentialPayload, checkCredentialStatus } from '@one/credo'
import { holderAgent } from '../agent/agent-store'
import { getHolderDid } from '../agent/holder-did-store'
import { envConfig } from '../config'
import type { CredentialExchangeDto } from './credential-exchange.dto'

@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name)

  async proposeCredential(
    params: CredentialExchangeDto,
  ): Promise<{ credentialExchangeId: string; state: string } | { error: string }> {
    const result = await proposeCredential(holderAgent, params, { getHolderDid })
    if ('error' in result) this.logger.error('proposeCredential failed', result.error)
    return result
  }

  async listCredentials(): Promise<{ credentials: unknown[] } | { error: string }> {
    const agent = holderAgent as { w3cCredentials?: { findAllByQuery: (q: Record<string, unknown>) => Promise<Array<{ encoded?: unknown; jsonCredential?: unknown }>> } }
    if (!agent) return { error: 'Agent not ready' }
    const w3cApi = agent.w3cCredentials
    if (!w3cApi?.findAllByQuery) return { credentials: [] }
    const creds = await w3cApi.findAllByQuery({})
    return {
      credentials: creds.map((c) => toCredentialPayload(c.encoded, c.jsonCredential)),
    }
  }

  async checkCredentialStatus(credentialId: string): Promise<{ revoked: boolean; error?: string }> {
    const result = await checkCredentialStatus(envConfig.vdrServiceUrl, credentialId)
    return {
      revoked: result.revoked,
      error: result.error,
    }
  }

  async listCredentialsWithStatus(): Promise<{ credentials: { id?: string; revoked: boolean | null; credential: unknown }[] } | { error: string }> {
    const agent = holderAgent as { w3cCredentials?: { findAllByQuery: (q: Record<string, unknown>) => Promise<Array<{ encoded?: unknown; jsonCredential?: unknown }>> } }
    if (!agent) return { error: 'Agent not ready' }
    const w3cApi = agent.w3cCredentials
    if (!w3cApi?.findAllByQuery) return { credentials: [] }

    const creds = await w3cApi.findAllByQuery({})
    const results: { id?: string; revoked: boolean | null; credential: unknown }[] = []

    for (const c of creds) {
      const payload = toCredentialPayload(c.encoded, c.jsonCredential) as Record<string, unknown>
      const id = payload?.id as string | undefined
      let revoked: boolean | null = null
      if (id) {
        const status = await this.checkCredentialStatus(id)
        revoked = status.error ? null : status.revoked
      }
      results.push({ id, revoked, credential: payload })
    }

    return { credentials: results }
  }
}
