/** DID did:custom del holder. Se asigna al arrancar el agente. */
export let holderDid: string | null = null

/** Asigna el DID del holder (llamado desde main tras ensureHolderDid). */
export function setHolderDid(did: string) {
  holderDid = did
}

/** Obtiene el DID del holder. Lanza si no fue inicializado. */
export function getHolderDid(): string {
  if (!holderDid) throw new Error('Holder DID not initialized')
  return holderDid
}
