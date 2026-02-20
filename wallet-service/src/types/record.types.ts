/**
 * Tipos compartidos para records del wallet.
 * Usados por el wallet-service (API REST) para tipar el StorageService y StorageController.
 */

/**
 * Datos JSON de un record Credo serializado (BaseRecord.toJSON()).
 * Cada record en la DB tiene (type, id, data) donde data es este objeto.
 */
export interface RecordData {
  /** UUID único del record, generado por Credo al crear el registro */
  id: string
  /** Tipo del record (ej: 'ConnectionRecord', 'DidRecord', 'OutOfBandRecord') */
  type?: string
  /** Fecha de creación ISO 8601 (ej: '2026-02-20T10:30:00.000Z') */
  createdAt?: string
  /** Fecha de última actualización ISO 8601 */
  updatedAt?: string
  /** Tags indexados del record, usados por Credo para queries rápidas */
  tags?: RecordTags
  /** Tags legacy (formato anterior de Credo, misma estructura que tags) */
  _tags?: RecordTags
  /** Rol del agente en el protocolo (ej: 'sender', 'receiver', 'issuer', 'holder') */
  role?: string
  /** Estado actual en la máquina de estados del protocolo (ej: 'completed', 'request-sent', 'offer-received') */
  state?: string
  /** DID propio del agente en esta relación/conexión */
  did?: string
  /** DID de la contraparte en esta relación/conexión */
  theirDid?: string
  /** DIDs propios anteriores (rotación de DID en conexiones) */
  previousDids?: string[]
  /** DIDs de la contraparte anteriores (rotación de DID) */
  previousTheirDids?: string[]
  /** ID del hilo DIDComm que agrupa mensajes de un mismo flujo */
  threadId?: string
  /** ID de otro record relacionado (ej: DidCommMessageRecord → ConnectionRecord) */
  associatedRecordId?: string
  /** ID de la conexión asociada (ej: en CredentialExchangeRecord) */
  connectionId?: string
  /** Invitación OOB embebida (solo OutOfBandRecord) */
  outOfBandInvitation?: {
    /** ID de la invitación (formato JSON-LD) */
    '@id'?: string
    /** ID de la invitación (formato alternativo) */
    id?: string
    /** Thread ID de la invitación */
    threadId?: string
    [key: string]: unknown
  }
  /** ID de la invitación OOB asociada */
  invitationId?: string
  /** Si la invitación es reutilizable (solo OutOfBandRecord) */
  reusable?: boolean
  /** Mensaje DIDComm almacenado (solo DidCommMessageRecord) */
  message?: {
    /** Tipo del mensaje DIDComm (ej: 'https://didcomm.org/connections/1.0/request') */
    '@type'?: string
    [key: string]: unknown
  }
  /** Claves asociadas al DID (solo DidRecord) */
  keys?: Array<{
    /** ID de la clave en el KMS */
    kmsKeyId?: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

/**
 * Tags de un record Credo. Credo los usa como índices para buscar records rápidamente.
 * En el wallet-service se almacenan dentro de data.tags / data._tags.
 */
export interface RecordTags {
  /** ID de la invitación OOB asociada al record */
  invitationId?: string
  /** Thread ID del protocolo DIDComm */
  threadId?: string
  /** Rol del agente (duplica record.role para indexación) */
  role?: string
  /** Estado del protocolo (duplica record.state para indexación) */
  state?: string
  /** Fingerprints de las claves receptoras (multibase z6L...), usados para encontrar el OOB record correspondiente a un mensaje entrante */
  recipientKeyFingerprints?: string[]
  /** Fingerprint de la clave de routing del mediador */
  recipientRoutingKeyFingerprint?: string
  /** DIDs alternativos del agente (ej: did:peer:4 tiene variantes) */
  alternativeDids?: string[]
  /** Nombre del mensaje DIDComm (ej: 'request', 'response') - extraído de @type */
  messageName?: string
  /** Nombre del protocolo DIDComm (ej: 'connections', 'issue-credential') - extraído de @type */
  protocolName?: string
  /** Versión mayor del protocolo (ej: '1' de '1.0') - extraída de @type */
  protocolMajorVersion?: string
  [key: string]: unknown
}

/** Resultado de una operación de guardado. */
export interface SaveResult {
  /** UUID del record guardado */
  id: string
}

/** Resultado genérico de operaciones exitosas (update, delete). */
export interface OkResult {
  ok: true
}

/** Item retornado por getAll / query: id + data JSON. */
export interface RecordItem {
  /** UUID del record */
  id: string
  /** Datos JSON del record serializado */
  data: RecordData
}
