/**
 * Wrapper del DidCommWsOutboundTransport de Credo que retrasa el cierre del
 * WebSocket para dar tiempo a que el mensaje se transmita por completo.
 *
 * Credo cierra el socket inmediatamente tras send(), lo que puede causar que
 * el receptor (Holder) no reciba el mensaje antes de que se corte la conexión.
 * Este transporte espera 10 segundos antes de cerrar.
 */
import { Buffer, CredoError } from '@credo-ts/core'
import { DidCommWsOutboundTransport } from '@credo-ts/didcomm'
import type { DidCommOutboundPackage } from '@credo-ts/didcomm'

const CLOSE_DELAY_MS = 10000

export class DidCommWsOutboundTransportDelayedClose extends DidCommWsOutboundTransport {
  override async sendMessage(outboundPackage: DidCommOutboundPackage): Promise<void> {
    const { payload, endpoint, connectionId } = outboundPackage
    const self = this as any
    self.logger?.debug?.(`Sending outbound message to endpoint '${endpoint}' over WebSocket transport.`, {
      payload,
    })
    if (!self.isActive) throw new CredoError('Outbound transport is not active. Not sending message.')
    if (!endpoint) throw new CredoError('Missing connection or endpoint. I don\'t know how and where to send the message.')
    const socketId = `${endpoint}-${connectionId}`
    const isNewSocket = !self.hasOpenSocket(socketId)
    const socket = await self.resolveSocket({ socketId, endpoint, connectionId })
    socket.send(Buffer.from(JSON.stringify(payload)))
    if (isNewSocket && !outboundPackage.responseRequested) {
      setTimeout(() => socket.close(), CLOSE_DELAY_MS)
    }
  }
}
