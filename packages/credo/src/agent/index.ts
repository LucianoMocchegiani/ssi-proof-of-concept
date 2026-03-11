export { buildDidsModule } from './build-dids-module'
export { registerWalletConfig } from './register-wallet'
export { registerKmsConfig, buildKeyManagementModule } from './register-kms'
export { createIssuerAgent } from './create-issuer-agent'
export { createHolderAgent } from './create-holder-agent'
export { createVerifierAgent } from './create-verifier-agent'
export type {
  CreateAgentOptions,
  CreateIssuerAgentOptions,
  CreateHolderAgentOptions,
  CreateVerifierAgentOptions,
} from './create-agent-options.types'
