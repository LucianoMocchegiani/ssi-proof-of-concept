/**
 * Wrapper del DidCommWsOutboundTransport de Credo que retrasa el cierre del
 * WebSocket para dar tiempo a que el mensaje se transmita por completo.
 *
 * Credo cierra el socket inmediatamente tras send(), lo que puede causar que
 * el receptor no reciba el mensaje antes de que se corte la conexión.
 */
import { Buffer, CredoError } from '@credo-ts/core'
import { DidCommWsOutboundTransport } from '@credo-ts/didcomm'
import type { DidCommOutboundPackage } from '@credo-ts/didcomm'

/** Socket retornado por resolveSocket (send + close). */
interface WsSocket {
  send(data: Buffer | string): void
  close(): void
}

/** Miembros protegidos del transport base necesarios para el override. */
interface WsTransportBase {
  logger?: { debug?(msg: string, meta?: unknown): void }
  isActive: boolean
  hasOpenSocket(socketId: string): boolean
  resolveSocket(params: {
    socketId: string
    endpoint: string
    connectionId: string
  }): Promise<WsSocket>
}

export class DidCommWsOutboundTransportDelayedClose extends DidCommWsOutboundTransport {
  /**
   * @param closeDelayMs - Milisegundos a esperar antes de cerrar el socket tras enviar.
   *   Por defecto 10000 (10 segundos). Define 0 para cerrar inmediatamente (comportamiento base de Credo).
   */
  constructor(private readonly closeDelayMs = 10000) {
    super()
  }

  override async sendMessage(
    outboundPackage: DidCommOutboundPackage
  ): Promise<void> {
    const { payload, endpoint, connectionId } = outboundPackage
    const base = this as unknown as WsTransportBase

    base.logger?.debug?.(
      `Sending outbound message to endpoint '${endpoint}' over WebSocket transport.`,
      { payload }
    )
    if (!base.isActive) {
      throw new CredoError(
        'Outbound transport is not active. Not sending message.'
      )
    }
    if (!endpoint) {
      throw new CredoError(
        "Missing connection or endpoint. I don't know how and where to send the message."
      )
    }

    const socketId = `${endpoint}-${connectionId ?? ''}`
    const isNewSocket = !base.hasOpenSocket(socketId)
    const socket = await base.resolveSocket({
      socketId,
      endpoint,
      connectionId: connectionId ?? '',
    })
    socket.send(Buffer.from(JSON.stringify(payload)))

    if (isNewSocket && !outboundPackage.responseRequested) {
      if (this.closeDelayMs > 0) {
        setTimeout(() => socket.close(), this.closeDelayMs)
      } else {
        socket.close()
      }
    }
  }
}
