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
import type {
  DidCreateOptions,
  DidCreateResult,
  DidDeactivateResult,
  DidUpdateResult,
} from '@credo-ts/core'
import { DidKey } from '@credo-ts/core'

/**
 * Configuración requerida por OneDidRegistrar.
 */
export interface OneDidRegistrarConfig {
  vdrServiceUrl: string
  didcommEndpoint: string
}

/**
 * Opciones de creación de DID did:custom.
 */
export interface OneDidCreateOptions extends DidCreateOptions {
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
 * y registra en vdr-service.
 */
export class OneDidRegistrar implements DidRegistrar {
  public readonly supportedMethods = ['custom']

  constructor(private readonly config: OneDidRegistrarConfig) {}

  async create(
    agentContext: AgentContext,
    options: OneDidCreateOptions
  ): Promise<DidCreateResult> {
    const didRepository = agentContext.dependencyManager.resolve(DidRepository)
    const kms = agentContext.dependencyManager.resolve(Kms.KeyManagementApi)

    try {
      let publicJwk: Record<string, unknown>
      let keyId: string

      const ed25519Type = { kty: 'OKP' as const, crv: 'Ed25519' as const }

      if (options.options?.createKey) {
        const opts = options.options.createKey
        const createResult = await kms.createKey({
          type:
            opts.type.kty === 'OKP' && opts.type.crv === 'Ed25519'
              ? ed25519Type
              : (opts.type as { kty: 'OKP'; crv: 'Ed25519' }),
        } as Kms.KmsCreateKeyOptions<typeof ed25519Type>)
        publicJwk = createResult.publicJwk as Record<string, unknown>
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
        publicJwk = pk as Record<string, unknown>
        keyId = options.options.keyId
      } else {
        const createResult = await kms.createKey({
          type: ed25519Type,
        } as Kms.KmsCreateKeyOptions<typeof ed25519Type>)
        publicJwk = createResult.publicJwk as Record<string, unknown>
        keyId = createResult.keyId
      }

      const jwk = Kms.PublicJwk.fromPublicJwk(
        publicJwk as { kty: 'OKP'; crv: 'Ed25519'; x: string; kid?: string }
      )
      const didKey = new DidKey(jwk)
      const newDid = `did:custom:${utils.uuid()}`
      const oldDid = didKey.did

      const docJson = didKey.didDocument.toJSON()
      const docStr = JSON.stringify(docJson)
      const newDocStr = docStr.split(oldDid).join(newDid)
      const didDocument = JsonTransformer.fromJSON(
        JSON.parse(newDocStr) as Record<string, unknown>,
        DidDocument
      )

      const recipientKeyId = `${newDid}#${jwk.fingerprint}`
      const didCommService = new DidCommV1Service({
        id: `${newDid}#inline-0`,
        serviceEndpoint: this.config.didcommEndpoint,
        recipientKeys: [recipientKeyId],
        routingKeys: [],
      })
      didDocument.service = [
        ...(didDocument.service ?? []),
        didCommService,
      ]

      const baseUrl = this.config.vdrServiceUrl.replace(/\/$/, '')
      await fetch(`${baseUrl}/did`, {
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
        tags: { recipientKeyFingerprints: [jwk.fingerprint] },
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: 'failed',
          reason: `unknownError: ${message}`,
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
