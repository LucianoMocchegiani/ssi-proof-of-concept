import type { AgentContext, BaseRecordConstructor } from '@credo-ts/core'
import { JsonTransformer, StorageVersionRecord } from '@credo-ts/core'
import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'
import { resolveConnectionToPath } from '../../utils/resolve-connection'

/**
 * Datos JSON de un record Credo serializado (BaseRecord.toJSON()).
 */
interface RecordData {
  id: string
  type?: string
  createdAt?: string
  updatedAt?: string
  tags?: RecordTags
  _tags?: RecordTags
  role?: string
  state?: string
  did?: string
  theirDid?: string
  previousDids?: string[]
  previousTheirDids?: string[]
  threadId?: string
  associatedRecordId?: string
  outOfBandInvitation?: { '@id'?: string; id?: string; threadId?: string; [key: string]: unknown }
  invitationId?: string
  message?: { '@type'?: string; [key: string]: unknown }
  [key: string]: unknown
}

interface RecordTags {
  invitationId?: string
  threadId?: string
  role?: string
  state?: string
  recipientKeyFingerprints?: string[]
  recipientRoutingKeyFingerprint?: string
  alternativeDids?: string[]
  messageName?: string
  protocolName?: string
  protocolMajorVersion?: string
  [key: string]: unknown
}

interface RecordQuery {
  id?: string
  associatedRecordId?: string
  invitationId?: string
  role?: string
  state?: string
  messageName?: string
  protocolName?: string
  protocolMajorVersion?: string
  threadId?: string
  recipientKeyFingerprints?: string | string[]
  $or?: QueryOrClause[]
}

interface QueryOrClause {
  role?: string
  did?: string
  theirDid?: string
  previousDids?: string[]
  previousTheirDids?: string[]
  alternativeDids?: string[]
  recipientKeyFingerprints?: string | string[]
  recipientRoutingKeyFingerprint?: string
}

interface ParsedMessageType {
  messageName: string
  protocolName: string
  protocolMajorVersion: string
}

interface DataRow {
  data: string
}

/**
 * Wallet interno: persistencia SQLite local via better-sqlite3.
 * Usa `connection` como path al archivo (hoy). Futuro: postgresql://, memory:.
 */
export class InternalWalletStorageService {
  private db: Database.Database

  /**
   * @param connection - Path al archivo SQLite, "memory:" para RAM, o vacío para default.
   */
  constructor(connection?: string) {
    const dbPath = resolveConnectionToPath(
      connection,
      './data/internal-wallet.sqlite'
    )
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }
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
    const existing = this.db
      .prepare('SELECT 1 FROM records WHERE type = ? AND id = ?')
      .get(SVR.type, SVR.storageVersionRecordId)
    if (!existing) {
      const data: RecordData = {
        id: SVR.storageVersionRecordId,
        createdAt: new Date().toISOString(),
        storageVersion: SVR.frameworkStorageVersion,
        type: SVR.type,
      }
      this.db
        .prepare('INSERT INTO records (type, id, data) VALUES (?, ?, ?)')
        .run(SVR.type, SVR.storageVersionRecordId, JSON.stringify(data))
    }
  }

  private ensureRecordInstance<T>(
    instance: T | null,
    recordClass: BaseRecordConstructor<T>
  ): T | null {
    if (!instance) return null
    if (typeof (instance as Record<string, unknown>).clone === 'function')
      return instance
    return JsonTransformer.fromJSON(
      JsonTransformer.toJSON(instance),
      recordClass,
      { validate: false }
    ) as T
  }

  async save(
    _ctx: AgentContext,
    record: {
      id: string
      constructor: { type?: string }
      type?: string
      toJSON?: () => RecordData
    }
  ): Promise<void> {
    const type = record.constructor.type ?? record.type ?? 'record'
    const data =
      typeof record.toJSON === 'function' ? record.toJSON() : (record as RecordData)
    this.db
      .prepare('INSERT OR REPLACE INTO records (type, id, data) VALUES (?, ?, ?)')
      .run(type, record.id, JSON.stringify(data))
  }

  async update(
    _ctx: AgentContext,
    record: {
      id: string
      constructor: { type?: string }
      type?: string
      toJSON?: () => RecordData
    }
  ): Promise<void> {
    const type = record.constructor.type ?? record.type ?? 'record'
    const data =
      typeof record.toJSON === 'function' ? record.toJSON() : (record as RecordData)
    this.db
      .prepare('UPDATE records SET data = ? WHERE type = ? AND id = ?')
      .run(JSON.stringify(data), type, record.id)
  }

  async delete(
    _ctx: AgentContext,
    record: {
      id: string
      constructor: { type?: string }
      type?: string
    }
  ): Promise<void> {
    const type = record.constructor.type ?? record.type ?? 'record'
    this.db
      .prepare('DELETE FROM records WHERE type = ? AND id = ?')
      .run(type, record.id)
  }

  async deleteById<T>(
    _ctx: AgentContext,
    recordClass: BaseRecordConstructor<T>,
    id: string
  ): Promise<void> {
    this.db
      .prepare('DELETE FROM records WHERE type = ? AND id = ?')
      .run(recordClass.type, id)
  }

  async getById<T>(
    _ctx: AgentContext,
    recordClass: BaseRecordConstructor<T>,
    id: string
  ): Promise<T | null> {
    const row = this.db
      .prepare('SELECT data FROM records WHERE type = ? AND id = ?')
      .get(recordClass.type, id) as DataRow | undefined
    if (!row) return null
    return this.ensureRecordInstance(
      JsonTransformer.fromJSON(JSON.parse(row.data), recordClass),
      recordClass
    )
  }

  async getAll<T>(
    _ctx: AgentContext,
    recordClass: BaseRecordConstructor<T>
  ): Promise<T[]> {
    const rows = this.db
      .prepare('SELECT data FROM records WHERE type = ?')
      .all(recordClass.type) as DataRow[]
    return rows
      .map((row) =>
        this.ensureRecordInstance(
          JsonTransformer.fromJSON(JSON.parse(row.data), recordClass),
          recordClass
        )
      )
      .filter((r): r is T => r !== null)
  }

  private parseMessageType(d: RecordData): ParsedMessageType | null {
    const msgType = d?.message?.['@type']
    if (typeof msgType !== 'string') return null
    const match = /^(.+)\/([^/\\]+)\/(\d+)\.(\d+)\/([^/\\]+)$/.exec(msgType)
    if (!match) return null
    return {
      protocolName: match[2],
      protocolMajorVersion: match[3],
      messageName: match[5],
    }
  }

  private filterByQuery(
    items: Array<{ data: RecordData }>,
    query: RecordQuery
  ): Array<{ data: RecordData }> {
    if (!query || typeof query !== 'object') return items

    return items.filter((item) => {
      const d = item.data
      const tags: RecordTags = (d?.tags ?? d?._tags ?? {}) as RecordTags

      if (query.id != null && d?.id !== query.id) return false
      if (
        query.associatedRecordId != null &&
        d?.associatedRecordId !== query.associatedRecordId
      )
        return false
      if (
        query.state != null &&
        d?.state !== query.state &&
        tags?.state !== query.state
      )
        return false

      if (query.invitationId != null) {
        const inv = d?.outOfBandInvitation
        const invId = inv?.['@id'] ?? inv?.id ?? tags?.invitationId
        if (invId !== query.invitationId) return false
      }

      if (query.role !== undefined && d?.role !== query.role) return false

      if (
        query.messageName != null ||
        query.protocolName != null ||
        query.protocolMajorVersion != null
      ) {
        const msgInfo =
          (tags?.messageName != null ? (tags as ParsedMessageType) : null) ??
          this.parseMessageType(d)
        if (query.messageName != null && msgInfo?.messageName !== query.messageName)
          return false
        if (
          query.protocolName != null &&
          msgInfo?.protocolName !== query.protocolName
        )
          return false
        if (
          query.protocolMajorVersion != null &&
          String(msgInfo?.protocolMajorVersion) !==
            String(query.protocolMajorVersion)
        )
          return false
      }

      if (query.threadId != null) {
        const tid =
          d?.threadId ?? d?.outOfBandInvitation?.threadId ?? tags?.threadId
        if (tid !== query.threadId) return false
      }

      if (
        query.recipientKeyFingerprints != null &&
        !Array.isArray(query.$or)
      ) {
        const fps: string[] = tags.recipientKeyFingerprints ?? []
        const q = Array.isArray(query.recipientKeyFingerprints)
          ? query.recipientKeyFingerprints
          : [query.recipientKeyFingerprints]
        if (!q.every((f) => fps.includes(f))) return false
      }

      if (Array.isArray(query.$or)) {
        const fps: string[] = tags.recipientKeyFingerprints ?? []
        const routingFp = tags.recipientRoutingKeyFingerprint

        const orMatch = query.$or.some((sub) => {
          if (sub?.role !== undefined && d?.role !== sub.role) return false

          const isConnectionDidQuery =
            (sub?.did != null || Array.isArray(sub?.previousDids)) &&
            (sub?.theirDid != null || Array.isArray(sub?.previousTheirDids))
          if (isConnectionDidQuery) {
            const didMatch =
              sub?.did != null
                ? d?.did === sub.did
                : Array.isArray(sub?.previousDids) &&
                  (d?.previousDids ?? []).includes(sub.previousDids![0])
            const theirDidMatch =
              sub?.theirDid != null
                ? d?.theirDid === sub.theirDid
                : Array.isArray(sub?.previousTheirDids) &&
                  (d?.previousTheirDids ?? []).includes(
                    sub.previousTheirDids![0]
                  )
            return didMatch && theirDidMatch
          }

          if (sub?.did != null && d?.did === sub.did) return true

          if (Array.isArray(sub?.alternativeDids)) {
            const alts: string[] = tags.alternativeDids ?? []
            if (sub.alternativeDids.some((ad) => alts.includes(ad)))
              return true
          }

          if (sub?.recipientKeyFingerprints) {
            const arr = Array.isArray(sub.recipientKeyFingerprints)
              ? sub.recipientKeyFingerprints
              : [sub.recipientKeyFingerprints]
            if (arr.some((f) => fps.includes(f))) return true
          }

          if (
            sub?.recipientRoutingKeyFingerprint &&
            routingFp === sub.recipientRoutingKeyFingerprint
          )
            return true

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

  async findByQuery<T>(
    _ctx: AgentContext,
    recordClass: BaseRecordConstructor<T>,
    query: RecordQuery
  ): Promise<T[]> {
    const rows = this.db
      .prepare('SELECT data FROM records WHERE type = ?')
      .all(recordClass.type) as DataRow[]
    const items = rows.map((row) => ({
      data: JSON.parse(row.data) as RecordData,
    }))
    let filtered = this.filterByQuery(items, query)

    const isOobRecipientQuery =
      recordClass.type === 'OutOfBandRecord' &&
      Array.isArray(query?.$or) &&
      query.$or.some(
        (s) =>
          s?.recipientKeyFingerprints != null ||
          s?.recipientRoutingKeyFingerprint != null
      )

    if (isOobRecipientQuery && filtered.length > 1) {
      filtered = filtered
        .sort(
          (a, b) =>
            this.parseDate(b.data?.createdAt ?? b.data?.updatedAt) -
            this.parseDate(a.data?.createdAt ?? a.data?.updatedAt)
        )
        .slice(0, 1)
    }

    return filtered
      .map((item) =>
        this.ensureRecordInstance(
          JsonTransformer.fromJSON(item.data, recordClass),
          recordClass
        )
      )
      .filter((r): r is T => r !== null)
  }
}
