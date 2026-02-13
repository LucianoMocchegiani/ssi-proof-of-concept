/** Referencia al agente Credo del verifier. Asignada tras bootstrap. */
export let verifierAgent: any = null

/** Asigna el agente verifier. */
export function setVerifierAgent(agent: any) {
  verifierAgent = agent
}
