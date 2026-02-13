/** Referencia al agente Credo del issuer. Asignada tras bootstrap. */
export let issuerAgent: any = null

/** Asigna el agente issuer. */
export function setIssuerAgent(agent: any) {
  issuerAgent = agent
}
