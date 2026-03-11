import type { Agent } from '@credo-ts/core'
import {
  DidCommCredentialEventTypes,
  DidCommCredentialState,
  DidCommProofEventTypes,
  DidCommProofState,
} from '@credo-ts/didcomm'
import type { DidCommCredentialExchangeRecord, DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { resolveLogger } from '../types/logger.types'
import type { CredoLogger } from '../types/logger.types'
import { setupConnectionListeners, setupMessageListeners } from './shared-listeners'

const VERIFIED_ASCII = `
╔═══════════════════════════╗
║                           ║
║   ✓  VERIFIED: true       ║
║   Presentation accepted   ║
║                           ║
╚═══════════════════════════╝
`

const NOT_VERIFIED_ASCII = `
╔═══════════════════════════╗
║                           ║
║   ✗  VERIFIED: false      ║
║   Presentation rejected   ║
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

export interface HolderListenersOptions {
  label?: string
  logger?: CredoLogger
}

async function expandPexSelection(
  agent: Agent,
  proofRecordId: string,
  pex: Record<string, unknown>,
  log: { log: (m: string, ...a: unknown[]) => void; warn: (m: string, ...a: unknown[]) => void }
): Promise<void> {
  try {
    const credentialsMap = (pex as { credentials?: Record<string, unknown> }).credentials
    if (!credentialsMap || typeof credentialsMap !== 'object') {
      log.warn('[Holder] expandPexSelection: no credentials map found')
      return
    }

    const formatData = await (agent as { didcomm: { proofs: { getFormatData(id: string): Promise<unknown> } } }).didcomm.proofs.getFormatData(
      proofRecordId
    )
    const pd = (formatData as { request?: { presentationExchange?: { presentation_definition?: { input_descriptors?: { id: string }[] } } } })
      ?.request?.presentationExchange?.presentation_definition
    if (!pd?.input_descriptors) return

    const allDescriptorIds = pd.input_descriptors.map((d) => d.id)
    const assignedIds = new Set(Object.keys(credentialsMap))
    const freeDescriptors = allDescriptorIds.filter((id) => !assignedIds.has(id))
    if (freeDescriptors.length === 0) return

    const requiredTypes = new Set<string>()
    for (const desc of pd.input_descriptors) {
      const fields = (desc as { constraints?: { fields?: { filter?: { contains?: { const?: string } } }[] } }).constraints?.fields ?? []
      for (const field of fields) {
        const c = field.filter?.contains?.const
        if (typeof c === 'string') requiredTypes.add(c)
      }
    }

    const w3cApi = (agent as { w3cCredentials?: { getAll(): Promise<unknown[]> } }).w3cCredentials
    if (!w3cApi?.getAll) return
    const allRecords = (await w3cApi.getAll()) as { id: string; firstCredential?: { type?: string[]; claimFormat?: unknown } }[]
    if (!allRecords?.length) return

    const usedRecordIds = new Set<string>()
    for (const val of Object.values(credentialsMap)) {
      const arr = Array.isArray(val) ? val : [val]
      for (const c of arr) {
        const id = (c as { credentialRecord?: { id?: string } })?.credentialRecord?.id
        if (id) usedRecordIds.add(id)
      }
    }

    const unusedRecords = allRecords.filter((record) => {
      if (usedRecordIds.has(record.id)) return false
      try {
        const cred = record.firstCredential
        if (!cred) return false
        const credTypes = cred.type ?? []
        if (requiredTypes.size === 0) return true
        return [...requiredTypes].every((rt) => credTypes.includes(rt))
      } catch {
        return false
      }
    })
    const toAssign = Math.min(freeDescriptors.length, unusedRecords.length)

    for (let i = 0; i < toAssign; i++) {
      const record = unusedRecords[i]
      const fc = record.firstCredential
      credentialsMap[freeDescriptors[i]] = [{ claimFormat: fc?.claimFormat, credentialRecord: record }]
    }

    if (toAssign > 0) log.log(`[Holder] Expanded PEX: added ${toAssign} extra credential(s)`)
  } catch (e) {
    log.warn('[Holder] expandPexSelection failed:', (e as Error)?.message)
  }
}

export function setupHolderListeners(agent: Agent, opts?: HolderListenersOptions): void {
  const label = opts?.label ?? 'Holder'
  const log = resolveLogger(opts?.logger)
  const shared = { label, logger: opts?.logger }
  setupMessageListeners(agent, shared)
  setupConnectionListeners(agent, shared)

  agent.events.on(
    DidCommCredentialEventTypes.DidCommCredentialStateChanged,
    async (ev: { payload?: { credentialExchangeRecord?: DidCommCredentialExchangeRecord } }) => {
      const record = ev.payload?.credentialExchangeRecord
      if (!record) return
      try {
        switch (record.state) {
          case DidCommCredentialState.OfferReceived:
            log.log('Holder: Offer received, accepting...')
            await agent.didcomm.credentials.acceptOffer({
              credentialExchangeRecordId: record.id,
              credentialFormats: { jsonld: {} },
            })
            break
          case DidCommCredentialState.CredentialReceived:
            log.log('Holder: Credential received, accepting...')
            await agent.didcomm.credentials.acceptCredential({
              credentialExchangeRecordId: record.id,
            })
            break
          case DidCommCredentialState.Done:
            log.log('Holder: Credential exchange completed, credential stored in wallet')
            break
        }
      } catch (err) {
        log.error('Holder credential listener error:', String(err))
      }
    }
  )

  agent.events.on(
    DidCommProofEventTypes.ProofStateChanged as string,
    async (ev: { payload?: { proofRecord?: DidCommProofExchangeRecord; proofExchangeRecord?: DidCommProofExchangeRecord } }) => {
      const record = (ev.payload?.proofRecord ?? ev.payload?.proofExchangeRecord) as DidCommProofExchangeRecord | undefined
      if (!record) return
      try {
        if (record.state === DidCommProofState.RequestReceived) {
          log.log('[Holder] Proof request received, selecting credentials...')
          const { proofFormats } = await agent.didcomm.proofs.selectCredentialsForRequest({
            proofExchangeRecordId: record.id,
          })

          const pex = (proofFormats as { presentationExchange?: Record<string, unknown> })?.presentationExchange
          if (pex) {
            await expandPexSelection(agent, record.id, pex, log)
          }

          await agent.didcomm.proofs.acceptRequest({
            proofExchangeRecordId: record.id,
            proofFormats,
          })
          log.log('[Holder] Presentation sent')
        } else if (record.state === DidCommProofState.Done) {
          log.log(VERIFIED_ASCII)
        } else if (record.state === DidCommProofState.Declined || record.state === DidCommProofState.Abandoned) {
          const r = record as { errorMessage?: string; problemReportMessage?: { description?: { en?: string } } }
          const errorMsg = r.errorMessage ?? r.problemReportMessage?.description?.en ?? ''
          if (errorMsg.toLowerCase().includes('revoked')) {
            log.log(REVOKED_ASCII)
          } else {
            log.log(NOT_VERIFIED_ASCII)
            if (errorMsg) log.log(`[Holder] Reason: ${errorMsg}`)
          }
        }
      } catch (err) {
        log.log(NOT_VERIFIED_ASCII)
        log.error('[Holder] Proof listener error:', String(err))
      }
    }
  )
}
