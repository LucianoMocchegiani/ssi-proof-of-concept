import type {
  AgentContext,
  DidResolutionResult,
  DidResolver,
  ParsedDid,
} from '@credo-ts/core'
import { DidDocument, JsonTransformer } from '@credo-ts/core'

/** Resuelve DIDs did:custom consultando vdr-service (GET /did/:id). */
export class OneDidResolver implements DidResolver {
  public readonly supportedMethods = ['custom']
  public readonly allowsCaching = true
  public readonly allowsLocalDidRecord = true

  constructor(private readonly baseUrl: string) {}

  async resolve(
    _agentContext: AgentContext,
    did: string,
    _parsed: ParsedDid,
    _didResolutionOptions?: unknown
  ): Promise<DidResolutionResult> {
    const didDocumentMetadata: Record<string, unknown> = {}

    try {
      const encodedDid = encodeURIComponent(did)
      const url = `${this.baseUrl.replace(/\/$/, '')}/did/${encodedDid}`
      const res = await fetch(url)
      if (!res.ok) {
        return {
          didDocument: null,
          didDocumentMetadata,
          didResolutionMetadata: {
            error: 'notFound',
            message: `Unable to resolve did '${did}': not found in registry`,
          },
        }
      }
      const data = (await res.json()) as Record<string, unknown>
      const didDocument = JsonTransformer.fromJSON(data, DidDocument)
      return {
        didDocument,
        didDocumentMetadata,
        didResolutionMetadata: { contentType: 'application/did+ld+json' },
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        didDocument: null,
        didDocumentMetadata,
        didResolutionMetadata: {
          error: 'notFound',
          message: `resolver_error: Unable to resolve did '${did}': ${message}`,
        },
      }
    }
  }
}
