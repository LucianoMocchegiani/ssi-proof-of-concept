import {
  Agent,
  AgentContext,
  DependencyManager,
  DidRepository,
  Kms,
  W3cCredentialsModule,
} from '@credo-ts/core'
import { agentDependencies, DidCommWsInboundTransport } from '@credo-ts/node'
import {
  DidCommModule,
  DidCommHttpOutboundTransport,
  DidCommModuleConfig,
  DidCommCredentialV2Protocol,
  DidCommJsonLdCredentialFormatService,
  DidCommProofV2Protocol,
  DidCommDifPresentationExchangeProofFormatService,
  DidCommCredentialEventTypes,
  DidCommCredentialState,
  DidCommProofEventTypes,
  DidCommProofState,
  DidCommConnectionEventTypes,
  DidCommEventTypes,
} from '@credo-ts/didcomm'
import type { DidCommCredentialExchangeRecord, DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { envConfig } from '../config'
import { holderAgentConfig } from './agent-holder.config'
import { registerWalletAdapter } from './agent-holder-wallet'
import { buildKeyManagementModule, registerKmsConfig } from './agent-holder-kms'
import { buildDidsModule } from './agent-holder-dids'
import { DidCommWsOutboundTransportDelayedClose } from '../transport/ws-outbound-delayed-close.transport'

/**
 * Inicializa el agente Credo del holder.
 * Si se pasa wsServer, monta WebSocket en el mismo puerto que la API.
 */
export const initializeHolderAgent = async (wsServer?: any) => {
  const dependencyManager = new DependencyManager()

  registerWalletAdapter(dependencyManager)
  dependencyManager.registerInstance(
    DidCommModuleConfig,
    new DidCommModuleConfig({ endpoints: [envConfig.didcommEndpoint] })
  )
  registerKmsConfig(dependencyManager)

  const inboundTransport = wsServer
    ? new DidCommWsInboundTransport({ server: wsServer })
    : new DidCommWsInboundTransport({ port: envConfig.didcommPort })

  const agent = new Agent(
    {
      config: holderAgentConfig,
      modules: {
        keyManagement: buildKeyManagementModule(),
        dids: buildDidsModule(),
        w3cCredentials: new W3cCredentialsModule({}),
        didcomm: new DidCommModule({
          endpoints: [envConfig.didcommEndpoint],
          transports: {
            inbound: [inboundTransport],
            outbound: [new DidCommHttpOutboundTransport(), new DidCommWsOutboundTransportDelayedClose()],
          },
          connections: { autoAcceptConnections: true },
          mediator: false,
          mediationRecipient: false,
          credentials: {
            credentialProtocols: [
              new DidCommCredentialV2Protocol({
                credentialFormats: [new DidCommJsonLdCredentialFormatService()],
              }),
            ],
          },
          proofs: {
            proofProtocols: [
              new DidCommProofV2Protocol({
                proofFormats: [new DidCommDifPresentationExchangeProofFormatService()],
              }),
            ],
          },
        }),
      },
      dependencies: agentDependencies,
    },
    dependencyManager
  )

  await agent.initialize()
  setupCredentialListeners(agent)
  setupProofListeners(agent)
  setupConnectionListeners(agent)
  setupMessageListeners(agent)
  return agent
}

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

/**
 * PEX con submission_requirements pick/min:1 solo selecciona el mínimo.
 * Esta función completa los descriptores vacíos con las credenciales restantes del wallet,
 * para que el holder presente TODAS las matching credentials.
 *
 * NOTA: proofFormats.presentationExchange tiene la forma { credentials: { [descriptorId]: [...] } }.
 * Debemos operar sobre pex.credentials, NO sobre pex directamente.
 */
async function expandPexSelection(agent: Agent, proofRecordId: string, pex: Record<string, unknown>): Promise<void> {
  try {
    const credentialsMap = (pex as any).credentials as Record<string, unknown> | undefined
    if (!credentialsMap || typeof credentialsMap !== 'object') {
      console.warn('[Holder] expandPexSelection: no credentials map found in presentationExchange')
      return
    }

    const formatData = await (agent as any).didcomm.proofs.getFormatData(proofRecordId)
    const pd = (formatData as any)?.request?.presentationExchange?.presentation_definition
    if (!pd?.input_descriptors) return

    const allDescriptorIds: string[] = pd.input_descriptors.map((d: any) => d.id)
    const assignedIds = new Set(Object.keys(credentialsMap))
    const freeDescriptors = allDescriptorIds.filter((id: string) => !assignedIds.has(id))
    if (freeDescriptors.length === 0) return

    const requiredTypes = new Set<string>()
    for (const desc of pd.input_descriptors as any[]) {
      for (const field of desc.constraints?.fields ?? []) {
        const filterConst = field.filter?.contains?.const
        if (typeof filterConst === 'string') requiredTypes.add(filterConst)
      }
    }

    const w3cApi = (agent as any).w3cCredentials
    if (!w3cApi?.getAll) return
    const allRecords: any[] = await w3cApi.getAll()
    if (!allRecords?.length) return

    const usedRecordIds = new Set<string>()
    for (const val of Object.values(credentialsMap)) {
      const arr = Array.isArray(val) ? val : [val]
      for (const c of arr) {
        const id = (c as any)?.credentialRecord?.id
        if (id) usedRecordIds.add(id)
      }
    }

    const unusedRecords = allRecords.filter((record: any) => {
      if (usedRecordIds.has(record.id)) return false
      try {
        const cred = record.firstCredential
        if (!cred) return false
        const credTypes: string[] = cred.type ?? []
        if (requiredTypes.size === 0) return true
        return [...requiredTypes].every((rt) => credTypes.includes(rt))
      } catch {
        return false
      }
    })
    const toAssign = Math.min(freeDescriptors.length, unusedRecords.length)

    for (let i = 0; i < toAssign; i++) {
      const record = unusedRecords[i]
      credentialsMap[freeDescriptors[i]] = [{
        claimFormat: record.firstCredential.claimFormat,
        credentialRecord: record,
      }]
    }

    if (toAssign > 0) {
      console.log(`[Holder] Expanded PEX: added ${toAssign} extra credential(s) to presentation`)
    }
  } catch (e) {
    console.warn('[Holder] expandPexSelection failed:', (e as Error)?.message)
  }
}

/** Listeners: cuando llega proof request, selecciona credenciales y envía presentation. */
function setupProofListeners(agent: Agent) {
  agent.events.on(DidCommProofEventTypes.ProofStateChanged as any, async ({ payload }) => {
    const record = (payload.proofRecord ?? payload.proofExchangeRecord) as DidCommProofExchangeRecord
    try {
      if (record.state === DidCommProofState.RequestReceived) {
        console.log('[Holder] Proof request received, selecting credentials...')
        const { proofFormats } = await agent.didcomm.proofs.selectCredentialsForRequest({
          proofExchangeRecordId: record.id,
        })

        const pex = (proofFormats as any)?.presentationExchange
        if (pex) {
          await expandPexSelection(agent, record.id, pex)
          const credMap = (pex as any).credentials ?? {}
          const entries = Object.entries(credMap)
          console.log(`[Holder] Presenting ${entries.length} credential(s):`)
          for (const [descriptorId, creds] of entries) {
            const credArray = Array.isArray(creds) ? creds : [creds]
            for (const c of credArray) {
              let id = 'unknown'
              try {
                const rec = (c as any)?.credentialRecord
                id = rec?.firstCredential?.id ?? rec?.id ?? 'unknown'
              } catch { /* ignore */ }
              console.log(`[Holder]   ${descriptorId} → ${id}`)
            }
          }
        }

        await agent.didcomm.proofs.acceptRequest({
          proofExchangeRecordId: record.id,
          proofFormats,
        })
        console.log('[Holder] Presentation sent')
      } else if (record.state === DidCommProofState.Done) {
        console.log(VERIFIED_ASCII)
      } else if (record.state === DidCommProofState.Declined || record.state === DidCommProofState.Abandoned) {
        const errorMsg = (record as any).errorMessage ?? (record as any).problemReportMessage?.description?.en ?? ''
        if (errorMsg.toLowerCase().includes('revoked')) {
          console.log(REVOKED_ASCII)
        } else {
          console.log(NOT_VERIFIED_ASCII)
          if (errorMsg) console.log(`[Holder] Reason: ${errorMsg}`)
        }
      }
    } catch (err) {
      console.log(NOT_VERIFIED_ASCII)
      console.error('[Holder] Proof listener error:', err)
    }
  })
}

/** Log cuando llega mensaje DIDComm (antes de procesar). */
function setupMessageListeners(agent: Agent) {
  agent.events.on(DidCommEventTypes.DidCommMessageReceived as any, (e: any) => {
    const type = e?.payload?.message?.type ?? e?.payload?.message?.['@type'] ?? 'unknown'
    // eslint-disable-next-line no-console
    console.log(`[Holder] DidCommMessageReceived type=${type}`)
  })
}

/** Log de estados de conexión para diagnóstico. */
function setupConnectionListeners(agent: Agent) {
  agent.events.on(DidCommConnectionEventTypes.DidCommConnectionStateChanged as any, (e: any) => {
    const state = e?.payload?.connectionRecord?.state
    const id = e?.payload?.connectionRecord?.id
    // eslint-disable-next-line no-console
    console.log(`[Holder] Connection ${id} state=${state}`)
  })
}

/** Listeners: acepta offer y credential automáticamente, guarda en wallet. */
function setupCredentialListeners(agent: Agent) {
  agent.events.on(DidCommCredentialEventTypes.DidCommCredentialStateChanged, async ({ payload }) => {
    const record = payload.credentialExchangeRecord as DidCommCredentialExchangeRecord
    try {
      switch (record.state) {
        case DidCommCredentialState.OfferReceived:
          // eslint-disable-next-line no-console
          console.log('Holder: Offer received, accepting...')
          await agent.didcomm.credentials.acceptOffer({
            credentialExchangeRecordId: record.id,
            credentialFormats: { jsonld: {} },
          })
          break
        case DidCommCredentialState.CredentialReceived:
          // eslint-disable-next-line no-console
          console.log('Holder: Credential received, accepting...')
          await agent.didcomm.credentials.acceptCredential({
            credentialExchangeRecordId: record.id,
          })
          break
        case DidCommCredentialState.Done:
          // eslint-disable-next-line no-console
          console.log('Holder: Credential exchange completed, credential stored in wallet')
          break
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Holder credential listener error:', err)
    }
  })
}

/** Obtiene o crea el did:custom del holder. Se llama al arrancar. */
export async function ensureHolderDid(agent: any): Promise<string> {
  const created = await agent.dids.getCreatedDids({ method: 'custom' })
  if (created?.length > 0) {
    const rec = created[0]
    const keyId = rec.keys?.[0]?.kmsKeyId
    if (keyId) {
      try {
        await agent.kms.getPublicKey({ keyId })
        return rec.did
      } catch (e) {
        if (e instanceof Kms.KeyManagementKeyNotFoundError) {
          const ctx = agent.dependencyManager.resolve(AgentContext)
          const didRepo = agent.dependencyManager.resolve(DidRepository)
          await didRepo.deleteById(ctx, rec.id)
          await fetch(`${envConfig.vdrServiceUrl}/did/delete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: rec.did }),
          }).catch(() => {})
        } else throw e
      }
    }
  }
  const result = await agent.dids.create({ method: 'custom', options: {} })
  const did = result.didState?.did ?? (result as any).did
  if (!did) throw new Error('Failed to create holder DID')
  return did
}
