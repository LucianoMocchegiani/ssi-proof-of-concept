import { AgentContext, BaseRecordConstructor, JsonTransformer } from '@credo-ts/core'

/**
 * Adaptador de almacenamiento remoto vía HTTP.
 * Implementa la interfaz de Credo StorageService delegando al storage-service.
 * Scope por walletId para que cada agente (issuer, holder, verifier) tenga sus propios registros.
 */
export class RemoteStorageService {
  constructor(
    private baseUrl: string,
    private walletId: string
  ) {}

  private scopeType(type: string): string {
    return `${this.walletId}::${type}`
  }

  private async call(path: string, init?: RequestInit) {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, init)
    if (!res.ok) throw new Error(`RemoteStorage error ${res.status}`)
    return res.json()
  }

  async save(_ctx: AgentContext, record: any) {
    const rawType = record.constructor.type || (record.type ?? 'record')
    const type = this.scopeType(rawType)
    const data = typeof record.toJSON === 'function' ? record.toJSON() : record
    const body = { type, id: record.id, data }
    return await this.call('/records', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  }

  private idInUrl(id: string) {
    return id.length <= 512
  }

  async update(_ctx: AgentContext, record: any) {
    const rawType = record.constructor.type || (record.type ?? 'record')
    const type = this.scopeType(rawType)
    const data = typeof record.toJSON === 'function' ? record.toJSON() : record
    if (this.idInUrl(record.id)) {
      await this.call(`/records/${encodeURIComponent(type)}/${encodeURIComponent(record.id)}`, { method: 'PUT', body: JSON.stringify({ data }), headers: { 'content-type': 'application/json' } })
    } else {
      await this.call('/records/update', { method: 'POST', body: JSON.stringify({ type, id: record.id, data }), headers: { 'content-type': 'application/json' } })
    }
  }

  async delete(_ctx: AgentContext, record: any) {
    const rawType = record.constructor.type || (record.type ?? 'record')
    const type = this.scopeType(rawType)
    if (this.idInUrl(record.id)) {
      await this.call(`/records/${encodeURIComponent(type)}/${encodeURIComponent(record.id)}`, { method: 'DELETE' })
    } else {
      await this.call('/records/delete', { method: 'POST', body: JSON.stringify({ type, id: record.id }), headers: { 'content-type': 'application/json' } })
    }
  }

  async deleteById(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, id: string) {
    const type = this.scopeType(recordClass.type)
    if (this.idInUrl(id)) {
      await this.call(`/records/${encodeURIComponent(type)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
    } else {
      await this.call('/records/delete', { method: 'POST', body: JSON.stringify({ type, id }), headers: { 'content-type': 'application/json' } })
    }
  }

  /** Asegura clone() en el registro (Credo Repository.update lo requiere). */
  private ensureRecordInstance<T>(instance: T | null, recordClass: BaseRecordConstructor<any>): T | null {
    if (!instance) return null
    if (typeof (instance as any).clone === 'function') return instance
    return JsonTransformer.fromJSON(JsonTransformer.toJSON(instance), recordClass, { validate: false }) as T
  }

  async getById(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, id: string) {
    const type = this.scopeType(recordClass.type)
    // Siempre POST para evitar problemas con caracteres en URL (:, etc.)
    const res = await fetch(`${this.baseUrl}/records/get`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, id }),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`RemoteStorage error ${res.status}`)
    const data = await res.json()
    return this.ensureRecordInstance(JsonTransformer.fromJSON(data, recordClass), recordClass)
  }

  async getAll(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>) {
    const type = this.scopeType(recordClass.type)
    const items = await this.call(`/records/${encodeURIComponent(type)}`)
    return (Array.isArray(items) ? items : []).map((item: { id: string; data: any }) =>
      this.ensureRecordInstance(JsonTransformer.fromJSON(item.data, recordClass), recordClass)
    )
  }

  /** Filtra por query: el storage-service retorna todos, filtramos aquí. */
  private filterByQuery(items: { id: string; data: any }[], query: any): { id: string; data: any }[] {
    if (!query || typeof query !== 'object') return items
    return items.filter((item) => {
      const d = item.data
      if (query.id != null && item.id !== query.id) return false
      if (query.invitationId != null && d?.outOfBandInvitation?.id !== query.invitationId) return false
      if (query.role !== undefined && d?.role !== query.role) return false
      if (query.recipientKeyFingerprints != null && !Array.isArray(query.$or)) {
        const tags = d?.tags ?? d?._tags ?? {}
        const fps = tags.recipientKeyFingerprints ?? []
        const q = Array.isArray(query.recipientKeyFingerprints) ? query.recipientKeyFingerprints : [query.recipientKeyFingerprints]
        if (!q.every((f: string) => fps.includes(f))) return false
      }
      if (Array.isArray(query.$or)) {
        const tags = d?.tags ?? d?._tags ?? {}
        const fps = tags.recipientKeyFingerprints ?? []
        const orMatch = query.$or.some((sub: any) => {
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
          return false
        })
        if (!orMatch) return false
      }
      return true
    })
  }

  async findByQuery(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, query: any) {
    const type = this.scopeType(recordClass.type)
    const body = { type, query }
    const items = await this.call('/records/query', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
    const filtered = this.filterByQuery(Array.isArray(items) ? items : [], query)
    return filtered.map((item: { id: string; data: any }) =>
      this.ensureRecordInstance(JsonTransformer.fromJSON(item.data, recordClass), recordClass)
    )
  }
}
