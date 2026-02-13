import type { AgentContext, BaseRecordConstructor } from '@credo-ts/core'
import { StorageVersionRecord } from '@credo-ts/core'

/**
 * Adaptador de almacenamiento en memoria para POC.
 * Implementa la interfaz de Credo StorageService.
 */
export class InMemoryStorageService {
  private map = new Map<string, any>()

  constructor() {
    // Pre-seed framework storage version record so migrations check succeeds in POC
    const key = `StorageVersionRecord:${(StorageVersionRecord as any).storageVersionRecordId}`
    this.map.set(key, {
      id: (StorageVersionRecord as any).storageVersionRecordId,
      createdAt: new Date(),
      storageVersion: (StorageVersionRecord as any).frameworkStorageVersion,
      type: (StorageVersionRecord as any).type,
    })
  }

  private key(recordClass: any, id: string) {
    const type = recordClass?.type ?? (recordClass?.constructor?.type ?? 'record')
    return `${type}:${id}`
  }

  async save(_ctx: AgentContext, record: any) {
    this.map.set(this.key(record.constructor, record.id), record)
  }

  async update(_ctx: AgentContext, record: any) {
    this.map.set(this.key(record.constructor, record.id), record)
  }

  async delete(_ctx: AgentContext, record: any) {
    this.map.delete(this.key(record.constructor, record.id))
  }

  async deleteById(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, id: string) {
    this.map.delete(this.key(recordClass, id))
  }

  async getById(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, id: string) {
    const v = this.map.get(this.key(recordClass, id))
    if (!v) throw new Error('RecordNotFound')
    return v
  }

  async getAll(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>) {
    const prefix = `${recordClass.type}:`
    return Array.from(this.map.entries())
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v)
  }

  async findByQuery(_ctx: AgentContext, recordClass: BaseRecordConstructor<any>, _query: any) {
    // naive: return all
    return this.getAll(_ctx, recordClass)
  }
}
