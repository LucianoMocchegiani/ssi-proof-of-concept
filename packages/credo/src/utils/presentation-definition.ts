/**
 * Utilidades para construir Presentation Definitions (DIF PEX).
 */

const MAX_DESCRIPTORS = 20

export interface BuildPresentationDefinitionOptions {
  /**
   * Número exacto de credenciales requeridas.
   * Si se pasa, genera N descriptores obligatorios.
   * Si no se pasa, genera MAX_DESCRIPTORS descriptores opcionales con
   * submission_requirements min:1 → el holder presenta TODAS las que tenga.
   */
  credentialCount?: number
  /** Tipos de credencial a solicitar (por defecto GenericCredential). */
  credentialTypes?: string[]
}

/**
 * Genera una Presentation Definition DIF PEX genérica.
 */
export function buildGenericPresentationDefinition(
  options?: BuildPresentationDefinitionOptions
): Record<string, unknown> {
  const count = options?.credentialCount ?? MAX_DESCRIPTORS
  const types = options?.credentialTypes ?? ['GenericCredential']

  const typeFilter = types[0] ?? 'GenericCredential'
  const descriptors = Array.from({ length: count }, (_, i) => ({
    id: `desc-generic-${i + 1}`,
    name: `Generic Credential #${i + 1}`,
    group: ['generic'],
    constraints: {
      fields: [
        {
          path: ['$.type'],
          filter: {
            type: 'array',
            contains: { const: typeFilter },
          },
        },
      ],
    },
  }))

  const pd: Record<string, unknown> = {
    id: options?.credentialCount
      ? `req-gen-${options.credentialCount}`
      : 'req-gen-all',
    input_descriptors: descriptors,
  }

  if (!options?.credentialCount) {
    pd.submission_requirements = [{ rule: 'pick', min: 1, from: 'generic' }]
  }

  return pd
}
