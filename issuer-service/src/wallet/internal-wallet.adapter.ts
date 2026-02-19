import type { AgentContext, BaseRecordConstructor } from '@credo-ts/core'
import { JsonTransformer, StorageVersionRecord } from '@credo-ts/core'
import Database from 'better-sqlite3'
import * as path from 'path'
import * as fs from 'fs'

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

  private seedStorageVersionRecord() {
    const SVR = StorageVersionRecord as any
    const type = SVR.type
    const id = SVR.storageVersionRecordId
    const existing = this.db.prepare('SELECT 1 FROM records WHERE type = ? AND id = ?').get(type, id)
    if (!existing) {
      const data = JSON.stringify({
        id,
        createdAt: new Date().toISOString(),
        storageVersion: SVR.frameworkStorageVersion,
        type,
      })
      this.db.prepare('INSERT INTO records (type, id, data) VALUES (?, ?, ?)').run(type, id, data)
    }
  }

  private ensureRecordInstance<T>(instance: T | null, recordClass: BaseRecordConstructor<any>): T | null {
    if (!instance) return null
    if (typeof (instance as any).clone === 'function') return instance
    return JsonTransformer.fromJSON(JsonTransformer.toJSON(instance), recordClass, { validate: false }) as T
  }

  async save(_ctx: AgentContext, record: any) {
    const type = record.constructor.type || (record.type ?? 'record')
    const data = typeof record.toJSON === 'function' ? record.toJSON() : record
    this.db.prepare('INSERT OR REPLACE INTO records (type, id, data) VALUES (?, ?, ?)').run(
      type, record.id, JSON.stringify(data),
    )
  }

  async update(_ctx: AgentContext, record: any) {
    const type = record.constructor.type || (record.type ?? 'record')
    const data = typeof record.toJSON === 'function' ? record.toJSON() : record
    this.db.prepare('UPDATE records SET data = ? WHERE type = ? AND id = ?').run(
      JSON.stringify(data), type, record.id,
    )
  }

  async delete(_ctx: AgentContext, record: any) {
    const type = record.constructor.type || (record.type ?? 'record')
    this.db.prepare('DELETE FROM records WHERE type = ? AND id = ?').run(type, record.id)
  }

  async deleteById(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, id: string) {
    this.db.prepare('DELETE FROM records WHERE type = ? AND id = ?').run(recordClass.type, id)
  }

  async getById(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, id: string) {
    const row = this.db.prepare('SELECT data FROM records WHERE type = ? AND id = ?').get(recordClass.type, id) as any
    if (!row) return null
    return this.ensureRecordInstance(JsonTransformer.fromJSON(JSON.parse(row.data), recordClass), recordClass)
  }

  async getAll(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>) {
    const rows = this.db.prepare('SELECT data FROM records WHERE type = ?').all(recordClass.type) as any[]
    return rows.map((row) =>
      this.ensureRecordInstance(JsonTransformer.fromJSON(JSON.parse(row.data), recordClass), recordClass)
    )
  }

  private parseMessageTypeFromRecord(d: any): { messageName?: string; protocolName?: string; protocolMajorVersion?: string } | null {
    const msgType = d?.message?.['@type']
    if (typeof msgType !== 'string') return null
    const match = /^(.+)\/([^/\\]+)\/(\d+)\.(\d+)\/([^/\\]+)$/.exec(msgType)
    if (!match) return null
    const [, , protocolName, major] = match
    return { protocolName, protocolMajorVersion: major, messageName: match[5] }
  }

  private filterByQuery(items: { data: any }[], query: any): { data: any }[] {
    if (!query || typeof query !== 'object') return items
    return items.filter((item) => {
      const d = item.data
      const tags = d?.tags ?? d?._tags ?? {}
      if (query.id != null && d?.id !== query.id) return false
      if (query.associatedRecordId != null && d?.associatedRecordId !== query.associatedRecordId) return false
      if (query.invitationId != null) {
        const inv = d?.outOfBandInvitation
        const invId = inv?.['@id'] ?? inv?.id ?? tags?.invitationId
        if (invId !== query.invitationId) return false
      }
      if (query.role !== undefined && d?.role !== query.role) return false
      if (query.messageName != null || query.protocolName != null || query.protocolMajorVersion != null) {
        const msgType = (tags?.messageName != null ? tags : null) ?? this.parseMessageTypeFromRecord(d)
        if (query.messageName != null && msgType?.messageName !== query.messageName) return false
        if (query.protocolName != null && msgType?.protocolName !== query.protocolName) return false
        if (query.protocolMajorVersion != null && String(msgType?.protocolMajorVersion) !== String(query.protocolMajorVersion)) return false
      }
      if (query.threadId != null) {
        const tid = d?.threadId ?? d?.outOfBandInvitation?.threadId ?? tags?.threadId
        if (tid !== query.threadId) return false
      }
      if (query.recipientKeyFingerprints != null && !Array.isArray(query.$or)) {
        const fps = tags.recipientKeyFingerprints ?? []
        const q = Array.isArray(query.recipientKeyFingerprints) ? query.recipientKeyFingerprints : [query.recipientKeyFingerprints]
        if (!q.every((f: string) => fps.includes(f))) return false
      }
      if (Array.isArray(query.$or)) {
        const fps = tags.recipientKeyFingerprints ?? []
        const routingFp = tags.recipientRoutingKeyFingerprint
        const orMatch = query.$or.some((sub: any) => {
          if (sub?.role !== undefined && d?.role !== sub.role) return false
          const isConnectionDidQuery =
            (sub?.did != null || Array.isArray(sub?.previousDids)) &&
            (sub?.theirDid != null || Array.isArray(sub?.previousTheirDids))
          if (isConnectionDidQuery) {
            const didMatch = sub?.did != null ? d?.did === sub.did : Array.isArray(sub?.previousDids) && (d?.previousDids ?? []).includes(sub.previousDids[0])
            const theirDidMatch =
              sub?.theirDid != null
                ? d?.theirDid === sub.theirDid
                : Array.isArray(sub?.previousTheirDids) && (d?.previousTheirDids ?? []).includes(sub.previousTheirDids[0])
            if (didMatch && theirDidMatch) return true
            return false
          }
          if (sub?.did != null && d?.did === sub.did) return true
          if (Array.isArray(sub?.alternativeDids)) {
            const alts = tags.alternativeDids ?? []
            if (sub.alternativeDids.some((ad: string) => alts.includes(ad))) return true
          }
          const subFps = sub?.recipientKeyFingerprints
          if (subFps) {
            const arr = Array.isArray(subFps) ? subFps : [subFps]
            if (arr.some((f: string) => fps.includes(f))) return true
          }
          const subRouting = sub?.recipientRoutingKeyFingerprint
          if (subRouting && routingFp === subRouting) return true
          return false
        })
        if (!orMatch) return false
      }
      return true
    })
  }

  async findByQuery(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, query: any) {
    const rows = this.db.prepare('SELECT data FROM records WHERE type = ?').all(recordClass.type) as any[]
    const items = rows.map((row) => ({ data: JSON.parse(row.data) }))
    let filtered = this.filterByQuery(items, query)
    const isOobRecipientQuery =
      recordClass.type === 'OutOfBandRecord' &&
      Array.isArray(query?.$or) &&
      query.$or.some((s: any) => s?.recipientKeyFingerprints != null || s?.recipientRoutingKeyFingerprint != null)
    if (isOobRecipientQuery && filtered.length > 1) {
      filtered = filtered.sort((a, b) => {
        const ta = a.data?.createdAt ?? a.data?.updatedAt ?? 0
        const tb = b.data?.createdAt ?? b.data?.updatedAt ?? 0
        return tb - ta
      }).slice(0, 1)
    }
    return filtered.map((item) =>
      this.ensureRecordInstance(JsonTransformer.fromJSON(item.data, recordClass), recordClass)
    )
  }
}
