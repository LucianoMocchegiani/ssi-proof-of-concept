import { Injectable } from '@nestjs/common'
import { verifierAgent } from '../agent/agent-store'

@Injectable()
export class ConnectionsService {
  async getConnections(): Promise<{
    connections: Array<{ id: string; theirDid?: string; state: string }>
  }> {
    const agent = verifierAgent as any
    if (!agent) return { connections: [] }
    const connApi = agent.didcomm?.connections
    if (!connApi?.findAllByQuery) return { connections: [] }
    const conns = await connApi.findAllByQuery({})
    return {
      connections: conns.map((c: any) => ({ id: c.id, theirDid: c.theirDid ?? c.did, state: c.state })),
    }
  }
}
