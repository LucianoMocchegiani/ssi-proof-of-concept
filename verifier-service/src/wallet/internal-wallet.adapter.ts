import type { AgentContext, BaseRecordConstructor } from '@credo-ts/core'
import { JsonTransformer, StorageVersionRecord } from '@credo-ts/core'
import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'

/**
 * Datos JSON de un record Credo serializado (BaseRecord.toJSON()).
 * Cada record en la DB tiene (type, id, data) donde data es este objeto.
 */
interface RecordData {
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
  /** Mensaje DIDComm almacenado (solo DidCommMessageRecord) */
  message?: {
    /** Tipo del mensaje DIDComm (ej: 'https://didcomm.org/connections/1.0/request') */
    '@type'?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Tags de un record Credo. Credo los usa como índices para buscar records rápidamente.
 * En nuestra implementación se filtran en memoria (filterByQuery).
 */
interface RecordTags {
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

/**
 * Query usada en findByQuery/filterByQuery.
 * Mapea los filtros que Credo puede enviar al buscar records.
 */
interface RecordQuery {
  /** Filtrar por ID exacto del record */
  id?: string
  /** Filtrar por ID del record asociado (ej: buscar mensajes de una conexión) */
  associatedRecordId?: string
  /** Filtrar por ID de invitación OOB */
  invitationId?: string
  /** Filtrar por rol del agente en el protocolo */
  role?: string
  /** Filtrar por estado del protocolo (ej: 'completed', 'request-sent') */
  state?: string
  /** Filtrar por nombre del mensaje DIDComm */
  messageName?: string
  /** Filtrar por nombre del protocolo DIDComm */
  protocolName?: string
  /** Filtrar por versión mayor del protocolo */
  protocolMajorVersion?: string
  /** Filtrar por thread ID del hilo DIDComm */
  threadId?: string
  /** Filtrar por fingerprints de claves receptoras */
  recipientKeyFingerprints?: string | string[]
  /** Cláusulas OR: al menos una debe matchear. Credo las usa para buscar conexiones por DID o fingerprint */
  $or?: QueryOrClause[]
}

/**
 * Cláusula individual dentro de $or.
 * Credo combina múltiples criterios con OR para buscar conexiones/OOBs.
 */
interface QueryOrClause {
  /** Filtrar por rol del agente */
  role?: string
  /** Filtrar por DID propio */
  did?: string
  /** Filtrar por DID de la contraparte */
  theirDid?: string
  /** Filtrar por DIDs propios anteriores (rotación) */
  previousDids?: string[]
  /** Filtrar por DIDs de contraparte anteriores (rotación) */
  previousTheirDids?: string[]
  /** Filtrar por DIDs alternativos */
  alternativeDids?: string[]
  /** Filtrar por fingerprints de claves receptoras */
  recipientKeyFingerprints?: string | string[]
  /** Filtrar por fingerprint de clave de routing del mediador */
  recipientRoutingKeyFingerprint?: string
}

/** Info extraída del @type de un mensaje DIDComm (ej: 'https://didcomm.org/connections/1.0/request'). */
interface ParsedMessageType {
  /** Nombre del mensaje (ej: 'request', 'response', 'offer') */
  messageName: string
  /** Nombre del protocolo (ej: 'connections', 'issue-credential') */
  protocolName: string
  /** Versión mayor del protocolo (ej: '1') */
  protocolMajorVersion: string
}

/** Fila cruda de SQLite (data como string JSON). */
interface DataRow {
  data: string
}

/**
 * Wallet interno: persistencia SQLite local via better-sqlite3.
 * Cada agente tiene su propia base de datos; no requiere wallet-service externo.
 */
export class InternalWalletStorageService {
  private db: Database.Database

  constructor(sqlitePath?: string) {
    const dbPath = sqlitePath || process.env.INTERNAL_WALLET_SQLITE_PATH || './data/internal-wallet.sqlite'
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS records (
        type TEXT NOT NULL,
        id   TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY(type, id)
      )
    `)
    this.seedStorageVersionRecord()
  }

  private seedStorageVersionRecord(): void {
    const SVR = StorageVersionRecord as unknown as {
      type: string
      storageVersionRecordId: string
      frameworkStorageVersion: string
    }
    const existing = this.db.prepare('SELECT 1 FROM records WHERE type = ? AND id = ?').get(SVR.type, SVR.storageVersionRecordId)
    if (!existing) {
      const data: RecordData = {
        id: SVR.storageVersionRecordId,
        createdAt: new Date().toISOString(),
        storageVersion: SVR.frameworkStorageVersion,
        type: SVR.type,
      }
      this.db.prepare('INSERT INTO records (type, id, data) VALUES (?, ?, ?)').run(SVR.type, SVR.storageVersionRecordId, JSON.stringify(data))
    }
  }

  private ensureRecordInstance<T>(instance: T | null, recordClass: BaseRecordConstructor<T>): T | null {
    if (!instance) return null
    if (typeof (instance as Record<string, unknown>).clone === 'function') return instance
    return JsonTransformer.fromJSON(JsonTransformer.toJSON(instance), recordClass, { validate: false }) as T
  }

  async save(_ctx: AgentContext, record: { id: string; constructor: { type?: string }; type?: string; toJSON?: () => RecordData }): Promise<void> {
    const type = record.constructor.type || (record.type ?? 'record')
    const data = typeof record.toJSON === 'function' ? record.toJSON() : record
    this.db.prepare('INSERT OR REPLACE INTO records (type, id, data) VALUES (?, ?, ?)').run(type, record.id, JSON.stringify(data))
  }

  async update(_ctx: AgentContext, record: { id: string; constructor: { type?: string }; type?: string; toJSON?: () => RecordData }): Promise<void> {
    const type = record.constructor.type || (record.type ?? 'record')
    const data = typeof record.toJSON === 'function' ? record.toJSON() : record
    this.db.prepare('UPDATE records SET data = ? WHERE type = ? AND id = ?').run(JSON.stringify(data), type, record.id)
  }

  async delete(_ctx: AgentContext, record: { id: string; constructor: { type?: string }; type?: string }): Promise<void> {
    const type = record.constructor.type || (record.type ?? 'record')
    this.db.prepare('DELETE FROM records WHERE type = ? AND id = ?').run(type, record.id)
  }

  async deleteById<T>(_ctx: AgentContext, recordClass: BaseRecordConstructor<T>, id: string): Promise<void> {
    this.db.prepare('DELETE FROM records WHERE type = ? AND id = ?').run(recordClass.type, id)
  }

  async getById<T>(_ctx: AgentContext, recordClass: BaseRecordConstructor<T>, id: string): Promise<T | null> {
    const row = this.db.prepare('SELECT data FROM records WHERE type = ? AND id = ?').get(recordClass.type, id) as DataRow | undefined
    if (!row) return null
    return this.ensureRecordInstance(JsonTransformer.fromJSON(JSON.parse(row.data), recordClass), recordClass)
  }

  async getAll<T>(_ctx: AgentContext, recordClass: BaseRecordConstructor<T>): Promise<T[]> {
    const rows = this.db.prepare('SELECT data FROM records WHERE type = ?').all(recordClass.type) as DataRow[]
    return rows.map((row) =>
      this.ensureRecordInstance(JsonTransformer.fromJSON(JSON.parse(row.data), recordClass), recordClass)
    ).filter((r): r is T => r !== null)
  }

  private parseMessageType(d: RecordData): ParsedMessageType | null {
    const msgType = d?.message?.['@type']
    if (typeof msgType !== 'string') return null
    const match = /^(.+)\/([^/\\]+)\/(\d+)\.(\d+)\/([^/\\]+)$/.exec(msgType)
    if (!match) return null
    return { protocolName: match[2], protocolMajorVersion: match[3], messageName: match[5] }
  }

  private filterByQuery(items: Array<{ data: RecordData }>, query: RecordQuery): Array<{ data: RecordData }> {
    if (!query || typeof query !== 'object') return items

    return items.filter((item) => {
      const d = item.data
      const tags: RecordTags = (d?.tags ?? d?._tags ?? {}) as RecordTags

      if (query.id != null && d?.id !== query.id) return false
      if (query.associatedRecordId != null && d?.associatedRecordId !== query.associatedRecordId) return false
      if (query.state != null && d?.state !== query.state && tags?.state !== query.state) return false

      if (query.invitationId != null) {
        const inv = d?.outOfBandInvitation
        const invId = inv?.['@id'] ?? inv?.id ?? tags?.invitationId
        if (invId !== query.invitationId) return false
      }

      if (query.role !== undefined && d?.role !== query.role) return false

      if (query.messageName != null || query.protocolName != null || query.protocolMajorVersion != null) {
        const msgInfo = (tags?.messageName != null ? tags as ParsedMessageType : null) ?? this.parseMessageType(d)
        if (query.messageName != null && msgInfo?.messageName !== query.messageName) return false
        if (query.protocolName != null && msgInfo?.protocolName !== query.protocolName) return false
        if (query.protocolMajorVersion != null && String(msgInfo?.protocolMajorVersion) !== String(query.protocolMajorVersion)) return false
      }

      if (query.threadId != null) {
        const tid = d?.threadId ?? d?.outOfBandInvitation?.threadId ?? tags?.threadId
        if (tid !== query.threadId) return false
      }

      if (query.recipientKeyFingerprints != null && !Array.isArray(query.$or)) {
        const fps: string[] = (tags.recipientKeyFingerprints ?? [])
        const q = Array.isArray(query.recipientKeyFingerprints) ? query.recipientKeyFingerprints : [query.recipientKeyFingerprints]
        if (!q.every((f) => fps.includes(f))) return false
      }

      if (Array.isArray(query.$or)) {
        const fps: string[] = (tags.recipientKeyFingerprints ?? [])
        const routingFp = tags.recipientRoutingKeyFingerprint

        const orMatch = query.$or.some((sub) => {
          if (sub?.role !== undefined && d?.role !== sub.role) return false

          const isConnectionDidQuery =
            (sub?.did != null || Array.isArray(sub?.previousDids)) &&
            (sub?.theirDid != null || Array.isArray(sub?.previousTheirDids))
          if (isConnectionDidQuery) {
            const didMatch = sub?.did != null
              ? d?.did === sub.did
              : Array.isArray(sub?.previousDids) && (d?.previousDids ?? []).includes(sub.previousDids![0])
            const theirDidMatch = sub?.theirDid != null
              ? d?.theirDid === sub.theirDid
              : Array.isArray(sub?.previousTheirDids) && (d?.previousTheirDids ?? []).includes(sub.previousTheirDids![0])
            return didMatch && theirDidMatch
          }

          if (sub?.did != null && d?.did === sub.did) return true

          if (Array.isArray(sub?.alternativeDids)) {
            const alts: string[] = (tags.alternativeDids ?? [])
            if (sub.alternativeDids.some((ad) => alts.includes(ad))) return true
          }

          if (sub?.recipientKeyFingerprints) {
            const arr = Array.isArray(sub.recipientKeyFingerprints) ? sub.recipientKeyFingerprints : [sub.recipientKeyFingerprints]
            if (arr.some((f) => fps.includes(f))) return true
          }

          if (sub?.recipientRoutingKeyFingerprint && routingFp === sub.recipientRoutingKeyFingerprint) return true

          return false
        })
        if (!orMatch) return false
      }

      return true
    })
  }

  private parseDate(v: string | undefined): number {
    if (!v) return 0
    const ms = Date.parse(v)
    return isNaN(ms) ? 0 : ms
  }

  async findByQuery<T>(_ctx: AgentContext, recordClass: BaseRecordConstructor<T>, query: RecordQuery): Promise<T[]> {
    const rows = this.db.prepare('SELECT data FROM records WHERE type = ?').all(recordClass.type) as DataRow[]
    const items = rows.map((row) => ({ data: JSON.parse(row.data) as RecordData }))
    let filtered = this.filterByQuery(items, query)

    const isOobRecipientQuery =
      recordClass.type === 'OutOfBandRecord' &&
      Array.isArray(query?.$or) &&
      query.$or.some((s) => s?.recipientKeyFingerprints != null || s?.recipientRoutingKeyFingerprint != null)

    if (isOobRecipientQuery && filtered.length > 1) {
      filtered = filtered
        .sort((a, b) => this.parseDate(b.data?.createdAt ?? b.data?.updatedAt) - this.parseDate(a.data?.createdAt ?? a.data?.updatedAt))
        .slice(0, 1)
    }

    return filtered
      .map((item) => this.ensureRecordInstance(JsonTransformer.fromJSON(item.data, recordClass), recordClass))
      .filter((r): r is T => r !== null)
  }
}
