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
  DidCommProofV2Protocol,
  DidCommDifPresentationExchangeProofFormatService,
  DidCommProofEventTypes,
  DidCommProofState,
  DidCommConnectionEventTypes,
  DidCommEventTypes,
} from '@credo-ts/didcomm'
import type { DidCommProofExchangeRecord } from '@credo-ts/didcomm'
import { envConfig } from '../config'
import { verifierAgentConfig } from './agent-verifier.config'
import { registerWalletAdapter } from './agent-verifier-wallet'
import { buildKeyManagementModule, registerKmsConfig } from './agent-verifier-kms'
import { buildDidsModule } from './agent-verifier-dids'
import { DidCommWsOutboundTransportDelayedClose } from '../transport/ws-outbound-delayed-close.transport'

/**
 * Inicializa el agente Credo del verifier.
 * Si se pasa wsServer, monta WebSocket en el mismo puerto que la API.
 */
export const initializeVerifierAgent = async (wsServer?: any) => {
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
      config: verifierAgentConfig,
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
          credentials: false,
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
  setupProofListeners(agent)
  setupConnectionListeners(agent)
  setupMessageListeners(agent)
  return agent
}

/** Log cuando llega mensaje DIDComm (antes de procesar). */
function setupMessageListeners(agent: Agent) {
  agent.events.on(DidCommEventTypes.DidCommMessageReceived as any, (e: any) => {
    const type = e?.payload?.message?.type ?? e?.payload?.message?.['@type'] ?? 'unknown'
    console.log(`[Verifier] DidCommMessageReceived type=${type}`)
  })
}

/** Log de estados de conexión para diagnóstico. */
function setupConnectionListeners(agent: Agent) {
  agent.events.on(DidCommConnectionEventTypes.DidCommConnectionStateChanged as any, (e: any) => {
    const state = e?.payload?.connectionRecord?.state
    const id = e?.payload?.connectionRecord?.id
    console.log(`[Verifier] Connection ${id} state=${state}`)
  })
}

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

/** Log de estados de proof para diagnóstico. */
function setupProofListeners(agent: Agent) {
  agent.events.on(DidCommProofEventTypes.ProofStateChanged as any, async ({ payload }) => {
    const record = (payload.proofRecord ?? payload.proofExchangeRecord) as DidCommProofExchangeRecord
    console.log(`[Verifier] Proof ${record.id} state=${record.state}`)
    if (record.state === DidCommProofState.PresentationReceived) {
      try {
        await agent.didcomm.proofs.acceptPresentation({ proofExchangeRecordId: record.id })
        console.log(VERIFIED_ASCII)
      } catch (err) {
        console.error(NOT_VERIFIED_ASCII)
        console.error('[Verifier] Proof accept error:', err)
      }
    }
  })
}

/** Obtiene o crea el did:custom del verifier. Se llama al arrancar. */
export async function ensureVerifierDid(agent: Agent): Promise<string> {
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
  if (!did) throw new Error('Failed to create verifier DID')
  return did
}
