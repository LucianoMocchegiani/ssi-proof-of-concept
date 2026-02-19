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

/** Listeners: cuando llega proof request, selecciona credenciales y envía presentation. */
function setupProofListeners(agent: Agent) {
  agent.events.on(DidCommProofEventTypes.ProofStateChanged as any, async ({ payload }) => {
    const record = (payload.proofRecord ?? payload.proofExchangeRecord) as DidCommProofExchangeRecord
    try {
      if (record.state === DidCommProofState.RequestReceived) {
        console.log('[Holder] Proof request received, selecting credentials and sending presentation...')
        const { proofFormats } = await agent.didcomm.proofs.selectCredentialsForRequest({
          proofExchangeRecordId: record.id,
        })
        await agent.didcomm.proofs.acceptRequest({
          proofExchangeRecordId: record.id,
          proofFormats,
        })
      } else if (record.state === DidCommProofState.Done) {
        console.log(VERIFIED_ASCII)
      } else if (record.state === DidCommProofState.Declined || record.state === DidCommProofState.Abandoned) {
        console.log(NOT_VERIFIED_ASCII)
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
