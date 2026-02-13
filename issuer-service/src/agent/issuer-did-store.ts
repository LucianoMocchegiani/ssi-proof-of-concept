/** DID did:custom del issuer. Se asigna al arrancar el agente. */
export let issuerDid: string | null = null

/** Asigna el DID del issuer (llamado desde main tras ensureIssuerDid). */
export function setIssuerDid(did: string) {
  issuerDid = did
}

/** Obtiene el DID del issuer. Lanza si no fue inicializado. */
export function getIssuerDid(): string {
  if (!issuerDid) throw new Error('Issuer DID not initialized')
  return issuerDid
}
