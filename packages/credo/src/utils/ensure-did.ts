import type { Agent } from '@credo-ts/core'
import { AgentContext, DidRepository, Kms } from '@credo-ts/core'

export interface EnsureDidOptions {
  method: 'custom'
  vdrServiceUrl: string
}

/**
 * Obtiene o crea el did:custom del agente.
 * Si la clave en KMS se perdió (ej. KMS interno reiniciado), elimina el DidRecord
 * y el DID del VDR, luego crea uno nuevo.
 */
export async function ensureDid(
  agent: Agent,
  options: EnsureDidOptions
): Promise<string> {
  const created = await agent.dids.getCreatedDids({ method: options.method })
  if (created.length > 0) {
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
          await fetch(`${options.vdrServiceUrl.replace(/\/$/, '')}/did/delete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: rec.did }),
          }).catch(() => undefined)
        } else {
          throw e
        }
      }
    }
  }

  const result = await agent.dids.create({
    method: options.method,
    options: {},
  })
  const did =
    result.didState?.did ?? (result as { did?: string }).did
  if (!did) {
    throw new Error('Failed to create DID')
  }
  return did
}
