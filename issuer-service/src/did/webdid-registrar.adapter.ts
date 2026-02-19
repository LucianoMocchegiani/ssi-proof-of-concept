import type { AgentContext } from '@credo-ts/core'
import {
  DidDocument,
  DidDocumentRole,
  DidRecord,
  DidRepository,
  JsonTransformer,
  Kms,
  utils,
} from '@credo-ts/core'
import type { DidRegistrar } from '@credo-ts/core'
import type { DidCreateOptions, DidCreateResult, DidDeactivateResult, DidUpdateResult } from '@credo-ts/core'
import { DidKey } from '@credo-ts/core'
import { envConfig } from '../config'

/**
 * Crea did:web registrando en vdr-service (emula publicar en la web sin usar Storage).
 * Formato local: did:web:local:<uuid>
 */
export interface WebDidCreateOptions extends DidCreateOptions {
  method: 'web'
  did?: never
  didDocument?: never
  secret?: never
  options: {
    createKey?: { type: { kty: string; crv: string } }
    keyId?: string
    domain?: string
  }
}

export class WebDidRegistrar implements DidRegistrar {
  public readonly supportedMethods = ['web']

  constructor(private baseUrl: string = envConfig.vdrServiceUrl) {}

  async create(agentContext: AgentContext, options: WebDidCreateOptions): Promise<DidCreateResult> {
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)
    const kms = agentContext.dependencyManager.resolve(Kms.KeyManagementApi)

    try {
      let publicJwk: any
      let keyId: string

      if (options.options?.createKey) {
        const createResult = await kms.createKey({ type: options.options.createKey.type } as any)
        publicJwk = createResult.publicJwk
        keyId = createResult.keyId
      } else if (options.options?.keyId) {
        const pk = await kms.getPublicKey({ keyId: options.options.keyId })
        if (!pk) {
          return {
            didDocumentMetadata: {},
            didRegistrationMetadata: {},
            didState: {
              state: 'failed',
              reason: `notFound: key '${options.options.keyId}' not found`,
            },
          }
        }
        publicJwk = pk
        keyId = options.options.keyId
      } else {
        const createResult = await kms.createKey({ type: { kty: 'OKP', crv: 'Ed25519' } } as any)
        publicJwk = createResult.publicJwk
        keyId = createResult.keyId
      }

      const domain = options.options?.domain || 'local'
      const newDid = `did:web:${domain}:${utils.uuid()}`
      const jwk = Kms.PublicJwk.fromPublicJwk(publicJwk)
      const didKey = new DidKey(jwk)
      const oldDid = didKey.did

      const docJson = didKey.didDocument.toJSON()
      const docStr = JSON.stringify(docJson)
      const newDocStr = docStr.split(oldDid).join(newDid)
      const didDocument = JsonTransformer.fromJSON(JSON.parse(newDocStr), DidDocument)

      await fetch(`${this.baseUrl}/did`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: newDid,
          document: didDocument.toJSON(),
        }),
      })

      const didRecord = new DidRecord({
        did: newDid,
        role: DidDocumentRole.Created,
        didDocument,
        keys: [
          {
            didDocumentRelativeKeyId: `#${jwk.fingerprint}`,
            kmsKeyId: keyId,
          },
        ],
      })
      await didRepository.save(agentContext, didRecord)

      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'finished',
          did: newDid,
          didDocument,
          secret: {},
        },
      }
    } catch (error: any) {
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'failed',
          reason: `unknownError: ${error?.message ?? error}`,
        },
      }
    }
  }

  async update(): Promise<DidUpdateResult> {
    return {
      didDocumentMetadata: {},
      didRegistrationMetadata: {},
      didState: {
        state: 'failed',
        reason: 'notSupported: cannot update did:web did',
      },
    }
  }

  async deactivate(): Promise<DidDeactivateResult> {
    return {
      didDocumentMetadata: {},
      didRegistrationMetadata: {},
      didState: {
        state: 'failed',
        reason: 'notSupported: cannot deactivate did:web did',
      },
    }
  }
}
