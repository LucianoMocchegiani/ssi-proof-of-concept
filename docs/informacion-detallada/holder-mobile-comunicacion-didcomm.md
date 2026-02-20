# Holder Mobile: Comunicación DIDComm sin URL pública

## El problema

En un entorno de microservicios (Docker), todos los agentes tienen endpoints accesibles entre sí:

```
Holder  (ws://holder-service:9005)
Issuer  (ws://issuer-service:3000)
Verifier (ws://verifier-service:9004)
```

Cada agente puede conectarse al otro porque están en la misma red. Pero en un **holder mobile** (teléfono), esto no funciona:

- El teléfono está detrás de NAT.
- No tiene IP fija ni DNS.
- No puede exponer un WebSocket server públicamente.
- La conexión se pierde cuando la app se cierra o el teléfono pierde red.

**¿Necesita el holder una URL pública?** No necesariamente. Hay dos mecanismos en DIDComm que resuelven esto.

---

## Mecanismo 1: Return Route (flujos iniciados por el holder)

### Concepto

DIDComm define un decorador de transporte `~transport` con la propiedad `return_route`. Cuando el holder envía un mensaje, puede indicar `"return_route": "all"`, lo que le dice al receptor: "mandame la respuesta por esta misma conexión que acabo de abrir".

### Flujo

```
1. Holder (mobile) ---[abre WebSocket]---> Verifier (URL pública)
2. Holder ---[envía mensaje + return_route: "all"]---> Verifier
3. Verifier ---[respuesta por el MISMO WebSocket]---> Holder
4. WebSocket se cierra
```

El holder nunca necesita exponer un endpoint. Abre una conexión saliente, envía su mensaje, y recibe la respuesta por el mismo canal.

### Ejemplo: Presentación de credencial

```
1. Holder escanea QR del Verifier (OOB invitation con URL del verifier)
2. Holder abre WebSocket a ws://verifier.example.com
3. Holder envía DID Exchange Request (con return_route: all)
4. Verifier responde DID Exchange Response por el mismo WS
5. Verifier envía Proof Request por el mismo WS
6. Holder envía Proof Presentation por el mismo WS
7. Verifier envía Proof Ack por el mismo WS
8. Conexión se cierra
```

### Limitaciones

- **Solo funciona cuando el holder inicia.** Si el verifier o issuer necesitan contactar al holder primero (sin que el holder haya escaneado un QR), no hay canal abierto.
- **No soporta mensajes offline.** Si el issuer quiere notificar una revocación al holder, no puede enviarle un mensaje porque no hay endpoint.

### Soporte en Credo

Credo-ts soporta `return_route` de forma nativa. Los transportes outbound (HTTP y WebSocket) manejan automáticamente las respuestas por el mismo canal cuando `return_route` está configurado.

---

## Mecanismo 2: Mediator (mensajes entrantes y offline)

### Concepto

Un **mediator** es un agente intermediario con URL pública que actúa como "buzón de correo" para el holder. El DID del holder apunta al mediator como service endpoint. Cuando alguien envía un mensaje al holder, llega al mediator, que lo almacena hasta que el holder lo recoja.

### Flujo

```
                    ┌─────────────┐
                    │   Mediator  │
                    │ (URL pública)│
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
   Issuer ──┘     Verifier ┘      Holder (mobile)
   envía msg      envía msg       recoge mensajes
   al holder      al holder       periódicamente
```

### Registro del holder con el mediator

```
1. Holder se conecta al Mediator
2. Holder solicita mediación (Mediation Request)
3. Mediator acepta (Mediation Grant) y entrega su endpoint
4. Holder configura su DID con el endpoint del Mediator
5. A partir de ahora, el DID del holder apunta al Mediator
```

### Recepción de mensajes

```
1. Verifier resuelve DID del holder → obtiene endpoint del Mediator
2. Verifier envía Proof Request al Mediator
3. Mediator almacena el mensaje en la cola del holder
4. Holder se conecta al Mediator (pickup protocol)
5. Holder recibe el Proof Request
6. Holder responde directamente al Verifier (o via Mediator)
```

### Pickup Protocol

DIDComm define el **Pickup Protocol** (Message Pickup v2) para que el holder recoja mensajes del mediator:

- **Status Request**: El holder pregunta "¿tenés mensajes para mí?"
- **Delivery**: El mediator entrega los mensajes pendientes.
- **Live Mode**: El holder mantiene una conexión abierta y recibe mensajes en tiempo real (como un WebSocket persistente al mediator).

### Notificaciones push

En producción, el mediator puede enviar push notifications al holder para avisarle que hay mensajes nuevos, evitando el polling constante:

```
1. Holder registra su token de push (FCM/APNs) con el Mediator
2. Cuando llega un mensaje, Mediator envía push notification
3. La app del holder se despierta y recoge los mensajes
```

### Soporte en Credo

Credo-ts tiene módulos dedicados:

- `MediatorModule`: Para crear un agente mediator.
- `MediationRecipientModule`: Para que un agente (holder) use un mediator.

Actualmente en el proyecto, el holder tiene `mediationRecipient: false`.

---

## Comparación de mecanismos

| Aspecto | Return Route | Mediator |
|---|---|---|
| Holder necesita URL pública | No | No (usa URL del mediator) |
| Quien inicia | Solo el holder | Cualquiera |
| Mensajes offline | No soportado | Soportado |
| Infraestructura adicional | Ninguna | Servicio mediator |
| Complejidad | Baja | Media-Alta |
| Caso de uso | Escanear QR, flujos interactivos | Notificaciones, revocaciones, mensajes asíncronos |

---

## ¿Qué necesita el DID del holder?

### Sin mediator (solo return-route)

El DID del holder NO necesita un service endpoint. O puede declarar un endpoint vacío/placeholder. El holder siempre inicia la comunicación abriendo un canal al otro agente.

```json
{
  "id": "did:custom:holder-123",
  "service": []
}
```

### Con mediator

El DID del holder declara el endpoint del mediator y las routing keys:

```json
{
  "id": "did:custom:holder-123",
  "service": [{
    "id": "#didcomm",
    "type": "DIDCommMessaging",
    "serviceEndpoint": "wss://mediator.example.com",
    "routingKeys": ["did:key:z6Mk...mediator-routing-key"]
  }]
}
```

Los mensajes se cifran primero para el holder, luego se envuelven con la routing key del mediator. El mediator puede almacenar el mensaje pero no puede leerlo (cifrado end-to-end).

---

## Recomendación para el proyecto

### Fase actual (desarrollo/PoC)

El setup actual con Docker y endpoints internos (`ws://holder-service:9005`) es correcto para desarrollo. No necesita mediator.

### Fase de integración mobile

1. **Paso 1**: Configurar el holder mobile sin endpoint, usando solo `return_route` para flujos donde el holder escanea QR (emisión de credenciales, presentación de pruebas).

2. **Paso 2**: Si se necesitan flujos donde el issuer/verifier contacten al holder (ej: notificación de revocación), agregar un servicio mediator.

3. **Paso 3**: Integrar push notifications con el mediator para evitar polling y mejorar la experiencia del usuario.

### Configuración del holder mobile en Credo (sin mediator)

```typescript
const agent = new Agent({
  config: {
    label: 'Holder Mobile',
    walletConfig: { id: 'holder-wallet', key: 'wallet-key' },
  },
  modules: {
    didcomm: new DidCommModule({
      endpoints: [],  // Sin endpoint público
      transports: {
        inbound: [],  // Sin transporte inbound
        outbound: [
          new DidCommHttpOutboundTransport(),
          new DidCommWsOutboundTransport(),
        ],
      },
      connections: { autoAcceptConnections: true },
      mediator: false,
      mediationRecipient: false,
    }),
  },
})
```

### Configuración del holder mobile en Credo (con mediator)

```typescript
const agent = new Agent({
  config: {
    label: 'Holder Mobile',
    walletConfig: { id: 'holder-wallet', key: 'wallet-key' },
  },
  modules: {
    didcomm: new DidCommModule({
      endpoints: [],
      transports: {
        inbound: [],
        outbound: [
          new DidCommHttpOutboundTransport(),
          new DidCommWsOutboundTransport(),
        ],
      },
      connections: { autoAcceptConnections: true },
      mediator: false,
      mediationRecipient: {
        mediatorInvitationUrl: 'https://mediator.example.com?oob=...',
        mediatorPickupStrategy: MediatorPickupStrategy.PickUpV2LiveMode,
      },
    }),
  },
})
```

---

## Referencias

- [DIDComm Messaging v2 - Transports](https://identity.foundation/didcomm-messaging/spec/v2.0/#transports)
- [DIDComm Return Route](https://identity.foundation/didcomm-messaging/spec/v2.0/#return-route)
- [Aries RFC 0211 - Mediator Coordination](https://github.com/hyperledger/aries-rfcs/tree/main/features/0211-route-coordination)
- [Aries RFC 0685 - Pickup Protocol v2](https://github.com/hyperledger/aries-rfcs/tree/main/features/0685-pickup-v2)
- [Credo-ts Mediator Module](https://credo.js.org/guides/extensions/mediator)
