import type { Agent } from '@credo-ts/core'
import { DidCommProofEventTypes, DidCommProofState } from '@credo-ts/didcomm'
import type { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { resolveLogger } from '../types/logger.types'
import type { CredoLogger } from '../types/logger.types'
import { setupConnectionListeners, setupMessageListeners } from './shared-listeners'

const VERIFIED_ASCII = `
╔═══════════════════════════╗
║                           ║
║   ✓  VERIFIED: true       ║
║   Proof valid & accepted  ║
║                           ║
╚═══════════════════════════╝
`

const NOT_VERIFIED_ASCII = `
╔═══════════════════════════╗
║                           ║
║   ✗  VERIFIED: false      ║
║   Proof invalid/rejected  ║
║                           ║
╚═══════════════════════════╝
`

const REVOKED_ASCII = `
╔═══════════════════════════════════╗
║                                   ║
║   ⊘  REVOKED                      ║
║   Credential has been revoked     ║
║   Presentation rejected           ║
║                                   ║
╚═══════════════════════════════════╝
`

export interface VerifierListenersOptions {
  label?: string
  vdrServiceUrl: string
  logger?: CredoLogger
}

async function extractCredentialIds(agent: Agent, proofRecordId: string): Promise<string[]> {
  try {
    const formatData = await (agent as { didcomm: { proofs: { getFormatData(id: string): Promise<unknown> } } }).didcomm.proofs.getFormatData(
      proofRecordId
    )
    const presentation = (formatData as { presentation?: { presentationExchange?: { verifiableCredential?: unknown[]; credentials?: unknown[] } } })
      ?.presentation?.presentationExchange
    if (!presentation) return []
    const credentials = (presentation.verifiableCredential ?? presentation.credentials ?? []) as unknown[]
    const ids: string[] = []
    for (const cred of credentials) {
      const vc = (cred as { credential?: { id?: string; credentialSubject?: { id?: string } } })?.credential ?? cred
      const v = vc as { id?: string; credentialSubject?: { id?: string } }
      const id = v.id ?? v.credentialSubject?.id
      if (typeof id === 'string' && id.startsWith('urn:uuid:')) ids.push(id)
    }
    return ids
  } catch {
    return []
  }
}

async function checkCredentialRevocation(
  credentialId: string,
  vdrServiceUrl: string
): Promise<{ revoked: boolean; statusListId?: string; statusListIndex?: number }> {
  try {
    const vdrUrl = vdrServiceUrl.replace(/\/$/, '')
    const res = await fetch(`${vdrUrl}/status/credential/${encodeURIComponent(credentialId)}/revoked`)
    if (res.status === 404) return { revoked: false }
    if (!res.ok) return { revoked: false }
    return (await res.json()) as { revoked: boolean; statusListId?: string; statusListIndex?: number }
  } catch {
    return { revoked: false }
  }
}

export function setupVerifierListeners(agent: Agent, opts: VerifierListenersOptions): void {
  const label = opts.label ?? 'Verifier'
  const log = resolveLogger(opts.logger)
  const shared = { label, logger: opts.logger }
  setupMessageListeners(agent, shared)
  setupConnectionListeners(agent, shared)

  agent.events.on(
    DidCommProofEventTypes.ProofStateChanged as string,
    async (ev: { payload?: { proofRecord?: DidCommProofExchangeRecord; proofExchangeRecord?: DidCommProofExchangeRecord } }) => {
      const record = (ev.payload?.proofRecord ?? ev.payload?.proofExchangeRecord) as DidCommProofExchangeRecord | undefined
      if (!record) return
      log.log(`[Verifier] Proof ${record.id} state=${record.state}`)
      if (record.state === DidCommProofState.PresentationReceived) {
        try {
          const credentialIds = await extractCredentialIds(agent, record.id)
          log.log(`[Verifier] Presentation contains ${credentialIds.length} credential(s)`)

          let hasRevoked = false
          const revokedIds: string[] = []

          for (let i = 0; i < credentialIds.length; i++) {
            const credId = credentialIds[i]
            const result = await checkCredentialRevocation(credId, opts.vdrServiceUrl)
            if (result.revoked) {
              log.log(
                `[Verifier]   [${i + 1}/${credentialIds.length}] ${credId} → REVOKED (list=${result.statusListId} index=${result.statusListIndex})`
              )
              hasRevoked = true
              revokedIds.push(credId)
            } else {
              log.log(`[Verifier]   [${i + 1}/${credentialIds.length}] ${credId} → OK`)
            }
          }

          if (hasRevoked) {
            log.log(REVOKED_ASCII)
            log.log(`[Verifier] Rejected: ${revokedIds.length} revoked credential(s) out of ${credentialIds.length}`)
            try {
              await (agent as { didcomm: { proofs: { sendProblemReport(opts: unknown): Promise<unknown> } } }).didcomm.proofs.sendProblemReport({
                proofExchangeRecordId: record.id,
                description: `Credential has been revoked: ${revokedIds.join(', ')}`,
              })
            } catch (e) {
              log.warn('[Verifier] sendProblemReport failed:', (e as Error)?.message)
            }
            try {
              const fresh = await (agent as { didcomm: { proofs: { getById(id: string): Promise<{ state?: string }>; update(r: unknown): Promise<unknown> } } })
                .didcomm.proofs.getById(record.id)
              if (fresh.state !== 'abandoned' && fresh.state !== 'declined') {
                ;(fresh as { state: string }).state = 'abandoned'
                await (agent as { didcomm: { proofs: { update(r: unknown): Promise<unknown> } } }).didcomm.proofs.update(fresh)
              }
            } catch (e) {
              log.warn('[Verifier] Could not update proof state:', (e as Error)?.message)
            }
            return
          }

          await agent.didcomm.proofs.acceptPresentation({ proofExchangeRecordId: record.id })
          log.log(VERIFIED_ASCII)
          if (credentialIds.length > 0) {
            log.log(`[Verifier] All ${credentialIds.length} credential(s) verified successfully`)
          }
        } catch (err) {
          log.error(NOT_VERIFIED_ASCII)
          log.error('[Verifier] Proof accept error:', String(err))
        }
      }
    }
  )
}
