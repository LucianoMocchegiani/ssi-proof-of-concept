import type { AgentContext } from '@credo-ts/core'
import {
  DidDocument,
  DidCommV1Service,
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
 * Opciones de creación de DID did:custom.
 */
export interface CustomDidCreateOptions extends DidCreateOptions {
  method: 'custom'
  did?: never
  didDocument?: never
  secret?: never
  options: {
    createKey?: { type: { kty: string; crv: string } }
    keyId?: string
  }
}

/**
 * Registrar de DIDs did:custom. Crea par de claves, DID Document con DidCommV1Service,
 * y registra en did-service (endpoint desde envConfig.didcommEndpoint).
 */
export class CustomDidRegistrar implements DidRegistrar {
  public readonly supportedMethods = ['custom']

  constructor(private baseUrl: string = envConfig.didServiceUrl) {}

  async create(agentContext: AgentContext, options: CustomDidCreateOptions): Promise<DidCreateResult> {
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

      const jwk = Kms.PublicJwk.fromPublicJwk(publicJwk)
      const didKey = new DidKey(jwk)
      const newDid = `did:custom:${utils.uuid()}`
      const oldDid = didKey.did

      const docJson = didKey.didDocument.toJSON()
      const docStr = JSON.stringify(docJson)
      const newDocStr = docStr.split(oldDid).join(newDid)
      const didDocument = JsonTransformer.fromJSON(JSON.parse(newDocStr), DidDocument)

      // Servicio DIDComm: recipientKeys debe referenciar el verification method en el doc (did:custom#fragment)
      const recipientKeyId = `${newDid}#${jwk.fingerprint}`
      const didCommService = new DidCommV1Service({
        id: `${newDid}#inline-0`,
        serviceEndpoint: envConfig.didcommEndpoint,
        recipientKeys: [recipientKeyId],
        routingKeys: [],
      })
      didDocument.service = [...(didDocument.service ?? []), didCommService]

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
        reason: 'notSupported: cannot update did:custom did',
      },
    }
  }

  async deactivate(): Promise<DidDeactivateResult> {
    return {
      didDocumentMetadata: {},
      didRegistrationMetadata: {},
      didState: {
        state: 'failed',
        reason: 'notSupported: cannot deactivate did:custom did',
      },
    }
  }
}
