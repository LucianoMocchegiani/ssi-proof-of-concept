import { Agent } from "@credo-ts/core"

//Recibir la invitación
//Tras crear la invitación, debemos transmitirla al otro agente. Al enviarla a un destinatario, es habitual incrustar la URL en un código QR. Este código QR puede ser escaneado por el destinatario, en este caso Bob . Tras esto, como ambos han configurado autoAcceptConnections[nombre del destinatario true], se establece la conexión.
export const receiveInvitation = async (agent: Agent, invitationUrl: string) => {
    // Usar el módulo didcomm del agente para procesar la invitación
    // Pasamos 'label' obtenido desde la configuración del agente para que el mensaje DID Exchange incluya label válido
    const agentLabel = (agent as any).config?.toJSON?.().label ?? 'demo-agent'
    const { outOfBandRecord } = await (agent as any).didcomm.oob.receiveInvitationFromUrl(invitationUrl, {
        label: agentLabel,
    })

    return outOfBandRecord
}

