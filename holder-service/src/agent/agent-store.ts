/** Referencia al agente Credo del holder. Se asigna tras bootstrap. */
export let holderAgent: any = null

/** Asigna el agente holder (llamado desde main tras initializeHolderAgent). */
export function setHolderAgent(agent: any) {
  holderAgent = agent
}
