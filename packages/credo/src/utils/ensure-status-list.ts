/**
 * Crea una StatusList en el VDR si no existe.
 * El issuer la usa para poder revocar credenciales.
 */
export async function ensureStatusList(
  issuerDid: string,
  vdrServiceUrl: string
): Promise<{ id: string; url: string }> {
  const vdrUrl = vdrServiceUrl.replace(/\/$/, '')
  const res = await fetch(`${vdrUrl}/status/list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ issuerId: issuerDid }),
  })
  if (!res.ok) {
    throw new Error(`Failed to create StatusList: ${res.status} ${await res.text()}`)
  }
  return res.json() as Promise<{ id: string; url: string }>
}
