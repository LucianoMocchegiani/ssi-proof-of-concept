import { randomUUID } from 'crypto'
import { allocateStatusIndex, registerCredentialMapping } from '../vdr/vdr-status-client'
import {
  buildOfferCredentialPayload,
  buildProposalCredentialPayload,
  getProofOptions,
} from '../utils/credential-builders'
import { buildGenericPresentationDefinition } from '../utils/presentation-definition'
import type { CredentialParams } from '../utils/credential-builders'

/** Interfaz mínima del agent Credo para credentials (issuer/holder). */
export interface CredentialsAgent {
  didcomm?: {
    credentials?: {
      offerCredential: (opts: unknown) => Promise<{ id: string; state: string }>
      proposeCredential: (opts: unknown) => Promise<{ id: string; state: string }>
    }
    connections?: {
      findById: (id: string) => Promise<{ theirDid?: string; previousTheirDids?: string[] } | null>
    }
  }
}

/** Interfaz mínima del agent Credo para proofs (verifier). */
export interface ProofsAgent {
  didcomm?: {
    proofs?: {
      requestProof: (opts: unknown) => Promise<{ id: string; state: string }>
    }
  }
}

export interface OfferCredentialParams extends CredentialParams {
  connectionId: string
  issuerDid?: string
}

export interface OfferCredentialOptions {
  vdrServiceUrl: string
  getIssuerDid: () => string
  getStatusList: () => { id: string }
}

export interface OfferCredentialResult {
  credentialExchangeId: string
  state: string
  credentialId: string
  statusListIndex?: number
}

export interface ProposeCredentialParams extends CredentialParams {
  connectionId: string
}

export interface ProposeCredentialOptions {
  getHolderDid: () => string
}

export interface ProposeCredentialResult {
  credentialExchangeId: string
  state: string
}

export interface RequestProofParams {
  connectionId: string
  presentationDefinition?: Record<string, unknown>
  credentialCount?: number
  challenge?: string
  domain?: string
}

export interface RequestProofResult {
  proofExchangeRecordId: string
  state: string
  mode: string
  error?: string
}

/**
 * Ofrece una credencial como issuer.
 * Alloca status index, construye el payload, llama al agent y registra el mapeo en VDR.
 */
export async function offerCredential(
  agent: CredentialsAgent | null,
  params: OfferCredentialParams,
  options: OfferCredentialOptions
): Promise<OfferCredentialResult | { error: string }> {
  if (!agent?.didcomm?.credentials) return { error: 'Agent not ready' }

  const conn = await agent.didcomm?.connections?.findById(params.connectionId)
  if (!conn) return { error: `Connection ${params.connectionId} not found` }

  const issuerDid = params.issuerDid ?? options.getIssuerDid()
  const holderDid = conn.theirDid ?? conn.previousTheirDids?.[0] ?? ''
  const credentialId = `urn:uuid:${randomUUID()}`

  let statusListIndex: number | undefined
  let statusListId: string | undefined
  try {
    const alloc = await allocateStatusIndex(options.vdrServiceUrl, params.issuerDid
      ? { issuerDid: params.issuerDid }
      : { statusListId: options.getStatusList().id })
    statusListIndex = alloc.statusListIndex
    statusListId = alloc.statusListId
  } catch {
    statusListIndex = undefined
    statusListId = undefined
  }

  const credential = buildOfferCredentialPayload(params, { credentialId, issuerDid, holderDid })
  const proofOptions = getProofOptions(params)

  try {
    const exchange = await agent.didcomm.credentials.offerCredential({
      connectionId: params.connectionId,
      protocolVersion: 'v2',
      credentialFormats: {
        jsonld: {
          credential,
          options: proofOptions,
        },
      },
    })

    if (statusListIndex != null && statusListId) {
      await registerCredentialMapping(options.vdrServiceUrl, credentialId, statusListId, statusListIndex)
    }

    return { credentialExchangeId: exchange.id, state: exchange.state, credentialId, statusListIndex }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

/**
 * Propone una credencial como holder.
 */
export async function proposeCredential(
  agent: CredentialsAgent | null,
  params: ProposeCredentialParams,
  options: ProposeCredentialOptions
): Promise<ProposeCredentialResult | { error: string }> {
  if (!agent?.didcomm?.credentials) return { error: 'Agent not ready' }

  const conn = await agent.didcomm?.connections?.findById(params.connectionId)
  if (!conn) return { error: `Connection ${params.connectionId} not found` }

  const credential = buildProposalCredentialPayload(params, { holderDid: options.getHolderDid() })
  const proofOptions = getProofOptions(params)

  try {
    const exchange = await agent.didcomm.credentials.proposeCredential({
      connectionId: params.connectionId,
      protocolVersion: 'v2',
      credentialFormats: {
        jsonld: {
          credential,
          options: proofOptions,
        },
      },
      comment: 'Requesting credential',
    })
    return { credentialExchangeId: exchange.id, state: exchange.state }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}

/**
 * Solicita una prueba al holder como verifier.
 */
export async function requestProof(
  agent: ProofsAgent | null,
  params: RequestProofParams
): Promise<RequestProofResult> {
  if (!agent?.didcomm?.proofs) {
    return { proofExchangeRecordId: '', state: 'error', mode: 'error', error: 'Agent or proofs module not ready' }
  }

  try {
    const pd = params.presentationDefinition ?? buildGenericPresentationDefinition({ credentialCount: params.credentialCount })
    const mode = params.credentialCount ? `exact:${params.credentialCount}` : 'all'
    const record = await agent.didcomm.proofs.requestProof({
      connectionId: params.connectionId,
      protocolVersion: 'v2',
      proofFormats: {
        presentationExchange: {
          presentationDefinition: pd,
          options: {
            challenge: params.challenge ?? `challenge-${Date.now()}`,
            domain: params.domain,
          },
        },
      },
    })
    return {
      proofExchangeRecordId: record.id,
      state: record.state,
      mode,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { proofExchangeRecordId: '', state: 'error', mode: 'error', error: message }
  }
}
