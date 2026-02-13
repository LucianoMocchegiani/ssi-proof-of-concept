import type { AgentContext, DidResolutionResult, DidResolver, ParsedDid } from '@credo-ts/core'
import { DidDocument, JsonTransformer } from '@credo-ts/core'
import { envConfig } from '../config'

/** Resuelve DIDs did:web consultando did-service. Reutiliza mismo endpoint que did:custom. */
export class WebDidResolver implements DidResolver {
  public readonly supportedMethods = ['web']
  public readonly allowsCaching = true
  public readonly allowsLocalDidRecord = true

  constructor(private baseUrl: string = envConfig.didServiceUrl) {}

  async resolve(
    _agentContext: AgentContext,
    did: string,
    _parsed: ParsedDid,
    _didResolutionOptions?: any
  ): Promise<DidResolutionResult> {
    const didDocumentMetadata = {}

    try {
      const encodedDid = encodeURIComponent(did)
      const url = `${this.baseUrl}/did/${encodedDid}`
      const res = await fetch(url)
      if (!res.ok) {
        return {
          didDocument: null,
          didDocumentMetadata,
          didResolutionMetadata: {
            error: 'notFound',
            message: `Unable to resolve did '${did}': not found`,
          },
        }
      }
      const data = await res.json()
      const didDocument = JsonTransformer.fromJSON(data, DidDocument)
      return {
        didDocument,
        didDocumentMetadata,
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
      }
    } catch (error: any) {
      return {
        didDocument: null,
        didDocumentMetadata,
        didResolutionMetadata: {
          error: 'notFound',
          message: `resolver_error: Unable to resolve did '${did}': ${error?.message ?? error}`,
        },
      }
    }
  }
}
