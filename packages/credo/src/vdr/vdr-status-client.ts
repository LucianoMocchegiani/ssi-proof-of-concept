/**
 * Cliente para operaciones de status list y revocación en el VDR.
 */

function normalizeVdrUrl(url: string): string {
  return url.replace(/\/$/, '')
}

export interface AllocateResult {
  statusListIndex: number
  statusListId: string
}

/**
 * Resuelve la StatusList que pertenece a un issuerDid consultando al VDR.
 * Si no se pasa issuerDid, usa statusListId (ej. del issuer default).
 */
export async function resolveStatusListId(
  vdrServiceUrl: string,
  options?: { issuerDid?: string; statusListId?: string }
): Promise<string> {
  if (options?.statusListId) return options.statusListId
  if (!options?.issuerDid) {
    throw new Error('Either issuerDid or statusListId must be provided')
  }
  const url = normalizeVdrUrl(vdrServiceUrl)
  const res = await fetch(`${url}/status/lists?issuerId=${encodeURIComponent(options.issuerDid)}`)
  if (!res.ok) {
    throw new Error(`Failed to query status lists for DID ${options.issuerDid}: ${res.status}`)
  }
  const lists = (await res.json()) as { id: string }[]
  if (!lists.length) {
    throw new Error(`No StatusList found for DID ${options.issuerDid}`)
  }
  return lists[0].id
}

/**
 * Pide un índice libre al VDR para la StatusList.
 */
export async function allocateStatusIndex(
  vdrServiceUrl: string,
  options: { issuerDid?: string; statusListId?: string }
): Promise<AllocateResult> {
  const listId = await resolveStatusListId(vdrServiceUrl, options)
  const url = normalizeVdrUrl(vdrServiceUrl)
  const res = await fetch(`${url}/status/list/${listId}/allocate`, { method: 'POST' })
  if (!res.ok) {
    throw new Error(`Failed to allocate status index: ${res.status}`)
  }
  const data = (await res.json()) as { statusListIndex: number }
  return { statusListIndex: data.statusListIndex, statusListId: listId }
}

/**
 * Registra en el VDR el mapeo credentialId → (statusListId, statusListIndex).
 */
export async function registerCredentialMapping(
  vdrServiceUrl: string,
  credentialId: string,
  statusListId: string,
  statusListIndex: number
): Promise<void> {
  const url = normalizeVdrUrl(vdrServiceUrl)
  const res = await fetch(`${url}/status/credential-map`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credentialId, statusListId, statusListIndex }),
  })
  if (!res.ok) {
    throw new Error(`Failed to register credential mapping: ${res.status}`)
  }
}

export interface RevokeMapping {
  revoked: boolean
  statusListId: string
  statusListIndex: number
}

/**
 * Consulta el estado de revocación de una credencial en el VDR.
 * 404 = no hay mapeo. 200 = mapeo existe con revoked true/false.
 */
export async function checkCredentialStatus(
  vdrServiceUrl: string,
  credentialId: string
): Promise<{ revoked: boolean; statusListId?: string; statusListIndex?: number; error?: string }> {
  try {
    const url = normalizeVdrUrl(vdrServiceUrl)
    const res = await fetch(`${url}/status/credential/${encodeURIComponent(credentialId)}/revoked`)
    if (res.status === 404) {
      return { revoked: false, error: 'No revocation mapping found for this credential' }
    }
    if (!res.ok) {
      return { revoked: false, error: `VDR returned ${res.status}` }
    }
    const data = (await res.json()) as RevokeMapping
    return {
      revoked: data.revoked,
      statusListId: data.statusListId,
      statusListIndex: data.statusListIndex,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { revoked: false, error: message }
  }
}

export interface RevokeResult {
  ok: boolean
  credentialId: string
  statusListId: string
  statusListIndex: number
}

/**
 * Revoca una credencial por su credentialId.
 * Consulta el VDR para obtener statusListId + statusListIndex y luego llama al revoke.
 */
export async function revokeCredential(
  vdrServiceUrl: string,
  credentialId: string
): Promise<RevokeResult> {
  const url = normalizeVdrUrl(vdrServiceUrl)
  const mapRes = await fetch(`${url}/status/credential/${encodeURIComponent(credentialId)}/revoked`)
  if (mapRes.status === 404) {
    throw new Error(`No revocation mapping found for credential ${credentialId}`)
  }
  if (!mapRes.ok) {
    throw new Error(`VDR lookup failed (${mapRes.status})`)
  }

  const mapping = (await mapRes.json()) as RevokeMapping
  if (mapping.revoked) {
    return { ok: true, credentialId, statusListId: mapping.statusListId, statusListIndex: mapping.statusListIndex }
  }

  const res = await fetch(`${url}/status/list/${mapping.statusListId}/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ statusListIndex: mapping.statusListIndex }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`VDR revoke failed (${res.status}): ${text}`)
  }

  return { ok: true, credentialId, statusListId: mapping.statusListId, statusListIndex: mapping.statusListIndex }
}
