import { Agent, AgentContext, DependencyManager, DidRepository, Kms, W3cCredentialsModule } from '@credo-ts/core'
import { agentDependencies, DidCommWsInboundTransport } from '@credo-ts/node'
import {
  DidCommModule,
  DidCommHttpOutboundTransport,
  DidCommModuleConfig,
  DidCommCredentialV2Protocol,
  DidCommJsonLdCredentialFormatService,
  DidCommCredentialEventTypes,
  DidCommCredentialState,
  DidCommConnectionEventTypes,
  DidCommEventTypes,
} from '@credo-ts/didcomm'
import type { DidCommCredentialExchangeRecord } from '@credo-ts/didcomm'
import { envConfig } from '../config'
import { issuerAgentConfig } from './agent-issuer.config'
import { registerStorageAdapter } from './agent-issuer-storage'
import { buildKeyManagementModule, registerKmsConfig } from './agent-issuer-kms'
import { buildDidsModule } from './agent-issuer-dids'
import { DidCommWsOutboundTransportDelayedClose } from '../transport/ws-outbound-delayed-close.transport'
import { getIssuerDid } from './issuer-did-store'

/**
 * Inicializa el agente Credo del issuer.
 * Si se pasa wsServer, monta WebSocket en el mismo puerto que la API.
 */
export const initializeIssuerAgent = async (wsServer?: any) => {
  const dependencyManager = new DependencyManager()

  registerStorageAdapter(dependencyManager)
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
      config: issuerAgentConfig,
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
        }),
      },
      dependencies: agentDependencies,
    },
    dependencyManager
  )

  await agent.initialize()
  setupCredentialListeners(agent)
  setupConnectionListeners(agent)
  setupMessageListeners(agent)
  return agent
}

/** Log cuando llega mensaje DIDComm (antes de procesar). */
function setupMessageListeners(agent: Agent) {
  agent.events.on(DidCommEventTypes.DidCommMessageReceived as any, () => {
    // eslint-disable-next-line no-console
    console.log('[Issuer] DidCommMessageReceived')
  })
}

/** Log de estados de conexión para diagnóstico. */
function setupConnectionListeners(agent: Agent) {
  agent.events.on(DidCommConnectionEventTypes.DidCommConnectionStateChanged as any, (e: any) => {
    const state = e?.payload?.connectionRecord?.state
    const id = e?.payload?.connectionRecord?.id
    // eslint-disable-next-line no-console
    console.log(`[Issuer] Connection ${id} state=${state}`)
  })
}

/** Listeners para Issue Credential: acepta proposal y request automáticamente. */
function setupCredentialListeners(agent: Agent) {
  agent.events.on(DidCommCredentialEventTypes.DidCommCredentialStateChanged, async ({ payload }) => {
    const record = payload.credentialExchangeRecord as DidCommCredentialExchangeRecord
    try {
      switch (record.state) {
        case DidCommCredentialState.ProposalReceived: {
          // eslint-disable-next-line no-console
          console.log('Issuer: Proposal received, sending offer...')
          const issuerDid = getIssuerDid()
          const formatData = await agent.didcomm.credentials.getFormatData(record.id)
          const proposalJsonLd = (formatData as any).proposal?.jsonld

          if (proposalJsonLd?.credential) {
            const proposed = proposalJsonLd.credential
            const customTypes = (proposed.type ?? []).filter((t: string) => t !== 'VerifiableCredential')
            const credential = {
              ...proposed,
              '@context': proposed['@context']?.length > 1
                ? proposed['@context']
                : [
                    'https://www.w3.org/2018/credentials/v1',
                    'http://schema.org/',
                    Object.fromEntries(customTypes.map((t: string) => [t, `https://www.w3.org/2018/credentials#${t}`])),
                  ],
              issuer: proposed.issuer || issuerDid,
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
          } else {
            await agent.didcomm.credentials.acceptProposal({
              credentialExchangeRecordId: record.id,
              comment: 'JSON-LD Credential Offer',
            })
          }
          break
        }
        case DidCommCredentialState.RequestReceived:
          // eslint-disable-next-line no-console
          console.log('Issuer: Request received, issuing credential...')
          await agent.didcomm.credentials.acceptRequest({
            credentialExchangeRecordId: record.id,
            comment: 'JSON-LD Credential',
          })
          break
        case DidCommCredentialState.Done:
          // eslint-disable-next-line no-console
          console.log('Issuer: Credential exchange completed')
          break
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Credential listener error:', err)
    }
  })
}

/** Obtiene o crea el did:custom del issuer. Se llama al arrancar. */
export async function ensureIssuerDid(agent: Agent): Promise<string> {
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
          // Clave perdida (ej. MockKMS tras reinicio): eliminar DidRecord y VDR, recrear.
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
  if (!did) throw new Error('Failed to create issuer DID')
  return did
}
