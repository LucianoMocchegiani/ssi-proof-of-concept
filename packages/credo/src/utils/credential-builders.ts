import { JsonTransformer } from '@credo-ts/core'

/**
 * Parámetros base para ofrecer o proponer una credencial.
 */
export interface CredentialParams {
  credential: {
    '@context'?: unknown
    credentialSubject?: Record<string, unknown>
    type?: string[]
  }
  proofType?: string
}

const DEFAULT_CONTEXTS = ['https://www.w3.org/2018/credentials/v1', 'http://schema.org/']

/**
 * Construye el @context para una credencial JSON-LD a partir de tipos custom.
 */
export function buildCredentialContext(
  customTypes: string[]
): (string | Record<string, string>)[] {
  if (customTypes.length === 0) {
    return DEFAULT_CONTEXTS as string[]
  }
  const typeMap = Object.fromEntries(
    customTypes.map((t) => [t, `https://www.w3.org/2018/credentials#${t}`])
  )
  return [...DEFAULT_CONTEXTS, typeMap] as (string | Record<string, string>)[]
}

/**
 * Construye el payload de credencial para offerCredential (issuer).
 */
export function buildOfferCredentialPayload(
  params: CredentialParams,
  options: {
    credentialId: string
    issuerDid: string
    holderDid: string
  }
): Record<string, unknown> {
  const customTypes = params.credential.type ?? ['GenericCredential']
  const credentialSubject = {
    ...params.credential.credentialSubject,
    id: params.credential.credentialSubject?.id ?? options.holderDid,
  }
  return {
    '@context':
      params.credential['@context'] ?? buildCredentialContext(customTypes),
    id: options.credentialId,
    type: ['VerifiableCredential', ...customTypes],
    issuer: options.issuerDid,
    issuanceDate: new Date().toISOString(),
    credentialSubject,
  }
}

/**
 * Construye el payload de credencial para proposeCredential (holder).
 */
export function buildProposalCredentialPayload(
  params: CredentialParams,
  options: { holderDid: string }
): Record<string, unknown> {
  const customTypes = params.credential.type ?? ['GenericCredential']
  return {
    '@context':
      params.credential['@context'] ?? buildCredentialContext(customTypes),
    type: ['VerifiableCredential', ...customTypes],
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: params.credential.credentialSubject?.id ?? options.holderDid,
      ...params.credential.credentialSubject,
    },
  }
}

/**
 * Obtiene proofType para credential formats.
 */
export function getProofOptions(params: { proofType?: string }): {
  proofType: string
  proofPurpose: string
} {
  return {
    proofType: params.proofType ?? 'Ed25519Signature2018',
    proofPurpose: 'assertionMethod',
  }
}

/**
 * Serializa un credential record de Credo a JSON legible.
 */
export function toCredentialPayload(encoded: unknown, json: unknown): unknown {
  if (typeof encoded === 'string') return encoded
  if (encoded && typeof encoded === 'object') {
    return JsonTransformer.toJSON(encoded as object)
  }
  return json && typeof json === 'object'
    ? JsonTransformer.toJSON(json as object)
    : encoded
}
