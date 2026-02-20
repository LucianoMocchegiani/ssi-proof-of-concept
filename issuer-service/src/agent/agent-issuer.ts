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
import { randomUUID } from 'crypto'
import { envConfig } from '../config'
import { issuerAgentConfig } from './agent-issuer.config'
import { registerWalletAdapter } from './agent-issuer-wallet'
import { buildKeyManagementModule, registerKmsConfig } from './agent-issuer-kms'
import { buildDidsModule } from './agent-issuer-dids'
import { DidCommWsOutboundTransportDelayedClose } from '../transport/ws-outbound-delayed-close.transport'
import { getIssuerDid } from './issuer-did-store'
import { getStatusList, hasStatusList } from './issuer-status-list-store'

/**
 * Inicializa el agente Credo del issuer.
 * Si se pasa wsServer, monta WebSocket en el mismo puerto que la API.
 */
export const initializeIssuerAgent = async (wsServer?: any) => {
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
          console.log('Issuer: Proposal received, sending offer...')
          const issuerDid = getIssuerDid()
          const formatData = await agent.didcomm.credentials.getFormatData(record.id)
          const proposalJsonLd = (formatData as any).proposal?.jsonld

          if (proposalJsonLd?.credential) {
            const proposed = proposalJsonLd.credential
            const customTypes = (proposed.type ?? []).filter((t: string) => t !== 'VerifiableCredential')
            const credentialId = proposed.id || `urn:uuid:${randomUUID()}`

            const credential = {
              ...proposed,
              id: credentialId,
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

            await registerRevocationMapping(credentialId)
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

/**
 * Reserva un índice en la StatusList y registra el mapeo en el VDR.
 * Se usa tanto desde offerCredential (flujo 1) como desde el listener de proposals (flujo 2).
 */
async function registerRevocationMapping(credentialId: string): Promise<void> {
  if (!hasStatusList()) return
  try {
    const vdrUrl = envConfig.vdrServiceUrl.replace(/\/$/, '')
    const sl = getStatusList()
    const allocRes = await fetch(`${vdrUrl}/status/list/${sl.id}/allocate`, { method: 'POST' })
    if (!allocRes.ok) return
    const { statusListIndex } = await allocRes.json() as { statusListIndex: number }

    await fetch(`${vdrUrl}/status/credential-map`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId, statusListId: sl.id, statusListIndex }),
    })
    console.log(`[Issuer] Revocation mapping: ${credentialId} → list=${sl.id} index=${statusListIndex}`)
  } catch {
    console.warn(`[Issuer] Could not register revocation mapping for ${credentialId}`)
  }
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

/**
 * Crea una StatusList en el VDR si no existe.
 * Se llama al arrancar para que el issuer pueda revocar credenciales.
 */
export async function ensureStatusList(issuerDid: string): Promise<{ id: string; url: string }> {
  const vdrUrl = envConfig.vdrServiceUrl.replace(/\/$/, '')
  const res = await fetch(`${vdrUrl}/status/list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ issuerId: issuerDid }),
  })
  if (!res.ok) {
    throw new Error(`Failed to create StatusList: ${res.status} ${await res.text()}`)
  }
  return res.json() as Promise<{ id: string; url: string }>
}
