# Revocación sin autorización en el VDR

## Contexto

El endpoint `POST /status/list/:id/revoke` del VDR permite revocar cualquier índice de cualquier StatusList sin verificar la identidad del caller.

## Estado actual

- Al crear una StatusList, se guarda el `issuer_id` (DID del issuer) en la tabla `status_lists`.
- Al revocar, el método `revoke()` solo busca la lista por `id` y flipea el bit. **No compara `issuer_id` con quien hace la llamada.**
- Lo mismo aplica para `POST /status/list/:id/allocate` (asignar índice).

## Por qué funciona hoy

- Cada issuer crea su propia StatusList al arrancar y solo revoca en su propia lista (usa `getStatusList().id`).
- No hay múltiples issuers ni acceso público al VDR.
- Los microservicios se comunican en una red Docker interna confiable.

## Riesgo

Si en el futuro:
- Hubiera **múltiples issuers** compartiendo el VDR, un issuer podría revocar credenciales de otro.
- El VDR fuera **accesible públicamente**, cualquiera podría revocar credenciales ajenas.

## Solución propuesta

Agregar autorización al VDR para los endpoints de escritura:

1. **Opción simple**: Enviar el `issuerId` en el body del request y validar que coincide con el `issuer_id` de la StatusList en la base de datos antes de permitir la operación.

2. **Opción con firma**: Requerir que el issuer firme el request con su clave privada. El VDR verifica la firma contra la clave pública del DID registrado. Esto es más seguro pero más complejo.

3. **Opción con token**: Implementar un mecanismo de API key o JWT que identifique al issuer. El VDR valida el token antes de ejecutar operaciones de escritura.

## Endpoints afectados

| Endpoint | Riesgo |
|----------|--------|
| `POST /status/list/:id/revoke` | Cualquiera puede revocar índices |
| `POST /status/list/:id/allocate` | Cualquiera puede consumir índices |
| `POST /status/list` | Cualquiera puede crear listas (menor riesgo) |

## Prioridad

Baja mientras el sistema sea de un solo issuer en red interna. Se vuelve crítica si se expone el VDR o se agregan múltiples issuers.

## Fecha de identificación

2026-02-19
