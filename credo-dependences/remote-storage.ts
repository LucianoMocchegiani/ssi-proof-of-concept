import { AgentContext, BaseRecordConstructor } from '@credo-ts/core'

const DEFAULT_URL = process.env.REMOTE_STORAGE_URL || 'http://localhost:4002'

export class RemoteStorageService {
  constructor(private baseUrl: string = DEFAULT_URL) {}

  private async call(path: string, init?: RequestInit) {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, init)
    if (!res.ok) throw new Error(`RemoteStorage error ${res.status}`)
    return res.json()
  }

  async save(_ctx: AgentContext, record: any) {
    const body = { type: record.constructor.type || (record.type ?? 'record'), id: record.id, data: record }
    const r = await this.call('/records', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
    return r
  }

  async update(_ctx: AgentContext, record: any) {
    const body = { data: record }
    await this.call(`/records/${encodeURIComponent(record.constructor.type || (record.type ?? 'record'))}/${encodeURIComponent(record.id)}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  }

  async delete(_ctx: AgentContext, record: any) {
    await this.call(`/records/${encodeURIComponent(record.constructor.type || (record.type ?? 'record'))}/${encodeURIComponent(record.id)}`, { method: 'DELETE' })
  }

  async deleteById(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, id: string) {
    await this.call(`/records/${encodeURIComponent(recordClass.type)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  async getById(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, id: string) {
    return await this.call(`/records/${encodeURIComponent(recordClass.type)}/${encodeURIComponent(id)}`)
  }

  async getAll(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>) {
    return await this.call(`/records/${encodeURIComponent(recordClass.type)}`)
  }

  async findByQuery(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, _query: any) {
    const body = { type: recordClass.type, query: _query }
    return await this.call(`/records/query`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  }
}

