import { DidsModule } from '@credo-ts/core'
import { OneDidResolver } from '../adapters/did/one-did-resolver'
import { OneDidRegistrar } from '../adapters/did/one-did-registrar'
import type { OneDidRegistrarConfig } from '../adapters/did/one-did-registrar'

/**
 * Construye DidsModule con OneDidResolver y OneDidRegistrar (did:custom).
 */
export function buildDidsModule(config: OneDidRegistrarConfig): DidsModule {
  return new DidsModule({
    resolvers: [new OneDidResolver(config.vdrServiceUrl)],
    registrars: [new OneDidRegistrar(config)],
  })
}
