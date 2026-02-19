import { Injectable } from '@nestjs/common'
import { issuerAgent } from '../agent/agent-store'

@Injectable()
export class ConnectionsService {
  async getConnections(): Promise<{
    connections: Array<{ id: string; holderDid?: string; issuerDid?: string; theirLabel?: string; state: string }>
    hint?: string
  }> {
    const agent = issuerAgent as any
    if (!agent) return { connections: [], hint: 'Connect holder first via OOB invitation' }
    const connApi = agent.didcomm?.connections
    if (!connApi?.findAllByQuery) return { connections: [], hint: 'Connect holder first via OOB invitation' }
    const conns = await connApi.findAllByQuery({ state: 'completed' })
    return {
      connections: conns.map((c: any) => ({
        id: c.id,
        holderDid: c.theirDid ?? c.previousTheirDids?.[0],
        issuerDid: c.did,
        theirLabel: c.theirLabel,
        state: c.state,
      })),
    }
  }

  async getConnection(id: string): Promise<
    | { id: string; holderDid?: string; issuerDid?: string; theirLabel?: string; state: string }
    | { error: string }
  > {
    const agent = issuerAgent as any
    if (!agent) return { error: 'Agent not ready' }
    const conn = await agent.didcomm?.connections?.findById(id)
    if (!conn) return { error: 'Connection not found' }
    return {
      id: conn.id,
      holderDid: conn.theirDid ?? conn.previousTheirDids?.[0],
      issuerDid: conn.did,
      theirLabel: conn.theirLabel,
      state: conn.state,
    }
  }
}
