import type { Agent } from '@credo-ts/core'
import { DidCommConnectionEventTypes, DidCommEventTypes } from '@credo-ts/didcomm'
import { resolveLogger } from '../types/logger.types'
import type { CredoLogger } from '../types/logger.types'

export interface SharedListenersOpts {
  label: string
  logger?: CredoLogger
}

export function setupMessageListeners(agent: Agent, opts: SharedListenersOpts): void {
  const log = resolveLogger(opts.logger)
  agent.events.on(DidCommEventTypes.DidCommMessageReceived as string, (e: unknown) => {
    const msg = (e as { payload?: { message?: { type?: string } } })?.payload?.message
    const type = msg?.type ?? (msg as { ['@type']?: string })?.['@type'] ?? 'unknown'
    log.log(`[${opts.label}] DidCommMessageReceived type=${type}`)
  })
}

export function setupConnectionListeners(agent: Agent, opts: SharedListenersOpts): void {
  const log = resolveLogger(opts.logger)
  agent.events.on(
    DidCommConnectionEventTypes.DidCommConnectionStateChanged as string,
    (e: { payload?: { connectionRecord?: { state?: string; id?: string } } }) => {
      const state = e?.payload?.connectionRecord?.state
      const id = e?.payload?.connectionRecord?.id
      log.log(`[${opts.label}] Connection ${id} state=${state}`)
    }
  )
}
