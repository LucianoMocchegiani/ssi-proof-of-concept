import { DidsModule } from '@credo-ts/core'
import { CustomDidResolver } from '../did/custom-did-resolver.adapter'
import { CustomDidRegistrar } from '../did/custom-did-registrar.adapter'
import { WebDidResolver } from '../did/webdid-resolver.adapter'

/** DidsModule con CustomDid + WebDid. Holder no usa WebDidRegistrar. */
export function buildDidsModule() {
  return new DidsModule({
    resolvers: [new CustomDidResolver(), new WebDidResolver()],
    registrars: [new CustomDidRegistrar()],
  })
}
