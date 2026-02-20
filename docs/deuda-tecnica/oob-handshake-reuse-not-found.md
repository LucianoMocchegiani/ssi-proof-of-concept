# OOB Handshake-Reuse: "No out of band record found"

## Estado: No crítico / Cosmético

## Error

```
CredoError: No out of band record found for handshake-reuse message
```

Se produce en el **issuer** (o verifier) al recibir un mensaje `out-of-band/1.1/handshake-reuse`.

## Contexto

El holder tiene configurado `reuseConnection: true` en `receiveInvitationFromUrl`. Cuando recibe una nueva invitación OOB de un agente con el que ya tiene conexión, envía un mensaje `handshake-reuse` en lugar de crear una conexión nueva.

El `pthid` (parent thread ID) del mensaje apunta al ID de la invitación OOB original.

## Causa raíz

1. El issuer crea una invitación OOB (single-use por defecto)
2. Se establece la conexión y se completa el flujo (ej: emisión de credencial)
3. Credo marca el OOB record como consumido/completado
4. En una segunda interacción, el holder reutiliza la conexión existente y envía `handshake-reuse` referenciando el `pthid` original
5. El issuer busca el OOB record por ese `pthid` pero **ya no lo encuentra** porque fue consumido

## Impacto

**Ninguno funcional.** La conexión ya existe y funciona correctamente. El credential ack y demás mensajes se procesan sin problema. El error es solo "ruido" en los logs.

## Por qué sigue funcionando a pesar del error

Cuando el holder recibe una nueva invitación OOB y ya tiene conexión con ese agente, ocurren **dos cosas en paralelo**:

### Camino 1: El flujo real (credencial/prueba)

El holder ya tiene una conexión activa (`completed`) con el issuer de la primera interacción. Al detectar que ya existe, reutiliza esa conexión para enviar los mensajes del protocolo real (proposal, request, offer, ack). Esto **funciona perfecto** porque la conexión está operativa e independiente del OOB.

### Camino 2: El handshake-reuse (mensaje de cortesía)

Al mismo tiempo, el holder envía un mensaje `handshake-reuse` al issuer informándole "estoy reutilizando nuestra conexión existente, no voy a crear una nueva". Este mensaje es **informativo** del protocolo OOB, no es un prerrequisito del flujo principal.

El issuer intenta procesarlo, busca el OOB record por `pthid`, no lo encuentra → error. Pero esto **no bloquea nada** porque:

- El holder **no espera** un `handshake-reuse-accepted` para continuar
- El protocolo real (credencial, prueba) ya está ejecutándose por la conexión existente
- Son canales lógicos separados: el fallo del reuse no interrumpe el flujo principal

## Posibles soluciones

### Opción 1: Dejarlo como está (recomendado por ahora)

No afecta ningún flujo. Es comportamiento esperado cuando se combina `reuseConnection: true` con invitaciones single-use.

### Opción 2: Invitaciones multi-use

Configurar el issuer para crear invitaciones con `multiUse: true`. Esto mantiene el OOB record disponible para futuros reuse. **Implicación:** cualquier agente puede usar la misma invitación múltiples veces, lo cual puede no ser deseable en todos los escenarios.

### Opción 3: Interceptar el error

Agregar un handler o middleware que capture este error específico y lo silencie, evitando que aparezca como ERROR en los logs. Requiere investigar si Credo expone hooks para esto.

## Reproducción

1. Issuer crea invitación OOB
2. Holder la procesa (se crea conexión)
3. Se completa un flujo (ej: credencial)
4. Issuer crea **otra** invitación OOB
5. Holder la procesa → envía `handshake-reuse` → error en issuer

## Stack trace relevante

```
CredoError: No out of band record found for handshake-reuse message
    at DidCommOutOfBandService.processHandshakeReuse
    at DidCommHandshakeReuseHandler.handle
    at DidCommDispatcher.defaultHandlerMiddleware
```

## Fecha de detección

2026-02-20
