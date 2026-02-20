/** Información de la StatusList activa del issuer para revocación. */
interface StatusListInfo {
  /** UUID de la lista en el VDR */
  id: string
  /** URL completa para referenciar en credentialStatus */
  url: string
}

let statusList: StatusListInfo | null = null

/** Asigna la StatusList activa (llamado desde main tras ensureStatusList). */
export function setStatusList(info: StatusListInfo): void {
  statusList = info
}

/** Obtiene la StatusList activa. Lanza si no fue inicializada. */
export function getStatusList(): StatusListInfo {
  if (!statusList) throw new Error('StatusList not initialized')
  return statusList
}

/** Retorna true si ya hay una StatusList configurada. */
export function hasStatusList(): boolean {
  return statusList !== null
}
