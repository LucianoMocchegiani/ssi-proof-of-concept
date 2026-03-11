import type { Agent } from '@credo-ts/core'
import { DidCommCredentialEventTypes, DidCommCredentialState } from '@credo-ts/didcomm'
import type { DidCommCredentialExchangeRecord } from '@credo-ts/didcomm'
import { randomUUID } from 'crypto'
import { resolveLogger } from '../types/logger.types'
import type { CredoLogger } from '../types/logger.types'
import { setupConnectionListeners, setupMessageListeners } from './shared-listeners'

export interface IssuerListenersOptions {
  label?: string
  vdrServiceUrl: string
  getIssuerDid: () => string
  getStatusList: () => { id: string }
  hasStatusList: () => boolean
  logger?: CredoLogger
}

async function registerRevocationMapping(
  credentialId: string,
  opts: IssuerListenersOptions
): Promise<void> {
  if (!opts.hasStatusList()) return
  const log = resolveLogger(opts.logger)
  try {
    const vdrUrl = opts.vdrServiceUrl.replace(/\/$/, '')
    const sl = opts.getStatusList()
    const allocRes = await fetch(`${vdrUrl}/status/list/${sl.id}/allocate`, { method: 'POST' })
    if (!allocRes.ok) return
    const { statusListIndex } = (await allocRes.json()) as { statusListIndex: number }
    await fetch(`${vdrUrl}/status/credential-map`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId, statusListId: sl.id, statusListIndex }),
    })
    log.log(`[Issuer] Revocation mapping: ${credentialId} → list=${sl.id} index=${statusListIndex}`)
  } catch {
    log.warn(`[Issuer] Could not register revocation mapping for ${credentialId}`)
  }
}

export function setupIssuerListeners(agent: Agent, opts: IssuerListenersOptions): void {
  const label = opts.label ?? 'Issuer'
  const shared = { label, logger: opts.logger }
  setupMessageListeners(agent, shared)
  setupConnectionListeners(agent, shared)

  agent.events.on(
    DidCommCredentialEventTypes.DidCommCredentialStateChanged,
    async (ev: { payload?: { credentialExchangeRecord?: DidCommCredentialExchangeRecord } }) => {
      const record = ev.payload?.credentialExchangeRecord
      if (!record) return
      const log = resolveLogger(opts.logger)
      try {
        switch (record.state) {
          case DidCommCredentialState.ProposalReceived: {
            log.log('Issuer: Proposal received, sending offer...')
            const issuerDid = opts.getIssuerDid()
            const formatData = await agent.didcomm.credentials.getFormatData(record.id)
            const proposalJsonLd = (formatData as { proposal?: { jsonld?: { credential?: unknown; options?: unknown } } }).proposal?.jsonld

            if (proposalJsonLd?.credential) {
              const proposed = proposalJsonLd.credential as Record<string, unknown>
              const customTypes = ((proposed.type as string[]) ?? []).filter((t: string) => t !== 'VerifiableCredential')
              const credentialId = (proposed.id as string) || `urn:uuid:${randomUUID()}`

              const credential = {
                ...proposed,
                id: credentialId,
                '@context':
                  (proposed['@context'] as unknown[])?.length > 1
                    ? proposed['@context']
                    : [
                        'https://www.w3.org/2018/credentials/v1',
                        'http://schema.org/',
                        Object.fromEntries(
                          customTypes.map((t: string) => [t, `https://www.w3.org/2018/credentials#${t}`])
                        ),
                      ],
                issuer: (proposed.issuer as string) || issuerDid,
              }

              await agent.didcomm.credentials.negotiateProposal({
                credentialExchangeRecordId: record.id,
                credentialFormats: {
                  jsonld: {
                    credential,
                    options: proposalJsonLd.options,
                  },
                },
                comment: 'JSON-LD Credential Offer',
              })

              await registerRevocationMapping(credentialId, opts)
            } else {
              await agent.didcomm.credentials.acceptProposal({
                credentialExchangeRecordId: record.id,
                comment: 'JSON-LD Credential Offer',
              })
            }
            break
          }
          case DidCommCredentialState.RequestReceived:
            log.log('Issuer: Request received, issuing credential...')
            await agent.didcomm.credentials.acceptRequest({
              credentialExchangeRecordId: record.id,
              comment: 'JSON-LD Credential',
            })
            break
          case DidCommCredentialState.Done:
            log.log('Issuer: Credential exchange completed')
            break
        }
      } catch (err) {
        log.error('Credential listener error:', String(err))
      }
    }
  )
}
