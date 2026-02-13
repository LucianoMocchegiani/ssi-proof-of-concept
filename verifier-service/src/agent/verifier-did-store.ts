/** DID did:custom del verifier. Se asigna al arrancar el agente. */
export let verifierDid: string | null = null

/** Asigna el DID del verifier (llamado desde main tras ensureVerifierDid). */
export function setVerifierDid(did: string) {
  verifierDid = did
}

/** Obtiene el DID del verifier. Lanza si no fue inicializado. */
export function getVerifierDid(): string {
  if (!verifierDid) throw new Error('Verifier DID not initialized')
  return verifierDid
}
