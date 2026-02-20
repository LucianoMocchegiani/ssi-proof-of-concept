# Revocación de Credenciales con Bitstring StatusList 2021

## Qué es una StatusList

Una StatusList es una estructura de datos compacta que permite al emisor (issuer) revocar credenciales verificables de forma eficiente. Sigue la especificación **W3C Bitstring Status List v2021**.

Consiste en una lista de bits donde cada posición corresponde a una credencial emitida:

```
StatusList (65,536 bits):
Índice:  0  1  2  3  4  5  6  7  8  ...
Valor:   0  0  1  0  0  0  1  0  0  ...
         ↑     ↑              ↑
       activa  REVOCADA     REVOCADA
```

- **Bit = 0** → credencial activa (no revocada)
- **Bit = 1** → credencial revocada

La lista se almacena comprimida (gzip + base64) y se publica en una URL accesible del VDR service.

## Almacenamiento

La tabla `status_lists` en el VDR (SQLite) contiene:

| Campo         | Tipo    | Descripción                                   |
|---------------|---------|-----------------------------------------------|
| id            | TEXT PK | UUID de la lista                              |
| issuer_id     | TEXT    | DID del issuer propietario                    |
| purpose       | TEXT    | Siempre `'revocation'`                        |
| encoded_list  | TEXT    | Base64(gzip(bitstring))                       |
| size          | INTEGER | Total de bits (default 65,536)                |
| next_index    | INTEGER | Próximo índice libre para asignar             |
| updated_at    | INTEGER | Timestamp de última modificación              |

## Ciclo de vida completo

### 1. Setup (una vez al arrancar el issuer)

El issuer crea una StatusList al inicializarse si no tiene una. Esto se hace con una llamada HTTP al VDR:

```
POST http://vdr-service:4003/status/list
Body: { "issuerId": "did:custom:issuer-xxx" }
Response: { "id": "abc-123", "url": "http://vdr-service:4003/status/list/abc-123" }
```

El `id` y `url` se guardan en memoria para usarlos durante la emisión.

### 2. Emisión (por cada credencial)

Al emitir una credencial, el issuer:

1. Pide un índice libre al VDR:

```
POST http://vdr-service:4003/status/list/abc-123/allocate
Response: { "statusListIndex": 42 }
```

2. Agrega el campo `credentialStatus` a la credencial:

```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1"],
  "type": ["VerifiableCredential", "GenericCredential"],
  "issuer": "did:custom:issuer-xxx",
  "issuanceDate": "2026-02-20T12:00:00Z",
  "credentialSubject": {
    "id": "did:custom:holder-yyy",
    "name": "Juan Pérez"
  },
  "credentialStatus": {
    "id": "http://vdr-service:4003/status/list/abc-123#42",
    "type": "BitstringStatusListEntry",
    "statusPurpose": "revocation",
    "statusListIndex": "42",
    "statusListCredential": "http://vdr-service:4003/status/list/abc-123"
  }
}
```

El campo `credentialStatus` le indica a cualquier verifier dónde consultar si la credencial fue revocada.

### 3. Revocación (cuando el issuer decide revocar)

El issuer llama al VDR para flipear el bit correspondiente:

```
POST http://vdr-service:4003/status/list/abc-123/revoke
Body: { "statusListIndex": 42 }
Response: { "ok": true, "revoked": 42 }
```

Internamente, el VDR:
1. Descomprime el bitstring (base64 → gzip → buffer de bits)
2. Pone en 1 el bit en la posición 42
3. Recomprime y guarda

### 4. Verificación (cuando el verifier recibe una prueba)

El verifier recibe una presentación del holder. Para verificar si la credencial fue revocada:

1. Lee `credentialStatus.statusListCredential` de la credencial → URL de la lista
2. Lee `credentialStatus.statusListIndex` → posición del bit
3. Consulta al VDR:

```
GET http://vdr-service:4003/revoked/abc-123/42
Response: { "revoked": true }
```

4. Si `revoked: true`, rechaza la presentación.

### 5. Consulta por el holder

El holder puede verificar si alguna de sus credenciales fue revocada consultando el mismo endpoint del VDR usando la información de `credentialStatus` almacenada en la credencial.

## Diagrama de secuencia

```
Issuer                          VDR Service                    Holder                     Verifier
  |                                |                             |                          |
  |--- POST /status/list --------->|                             |                          |
  |<-- {id, url} ------------------|                             |                          |
  |                                |                             |                          |
  |--- POST /status/list/:id/allocate ->|                        |                          |
  |<-- {statusListIndex: 42} ------|                             |                          |
  |                                |                             |                          |
  |--- Credencial con credentialStatus ----------------------->  |                          |
  |    (index 42, url de la lista) |                             |                          |
  |                                |                             |                          |
  |  ... tiempo pasa ...           |                             |                          |
  |                                |                             |                          |
  |--- POST /status/list/:id/revoke -->|                         |                          |
  |    {statusListIndex: 42}       |                             |                          |
  |<-- {ok: true} -----------------|                             |                          |
  |                                |                             |                          |
  |                                |                             |--- Presentación -------->|
  |                                |                             |                          |
  |                                |<---------- GET /revoked/abc-123/42 -------------------|
  |                                |----------- {revoked: true} --------------------------->|
  |                                |                             |                          |
  |                                |                             |    RECHAZADA (revocada)  |
```

## Endpoints del VDR (ya implementados)

| Método | Endpoint                          | Descripción                        | Usado por  |
|--------|-----------------------------------|------------------------------------|------------|
| POST   | `/status/list`                    | Crear nueva StatusList             | Issuer     |
| GET    | `/status/list/:id`                | Obtener bitstring comprimido       | Verifier   |
| POST   | `/status/list/:id/allocate`       | Asignar próximo índice libre       | Issuer     |
| POST   | `/status/list/:id/revoke`         | Revocar un índice (bit → 1)       | Issuer     |
| GET    | `/revoked/:listId/:index`         | Consultar si un índice fue revocado| Verifier/Holder |

## Endpoints del Issuer (nuevos)

| Método | Endpoint              | Descripción                                        |
|--------|-----------------------|----------------------------------------------------|
| POST   | `/revoke-credential`  | Revoca una credencial por statusListId + index      |

## Endpoints del Holder (nuevos)

| Método | Endpoint                         | Descripción                                    |
|--------|----------------------------------|------------------------------------------------|
| GET    | `/credential-status/:id`         | Consulta si una credencial almacenada fue revocada |

## Consideraciones

- **Capacidad**: cada StatusList soporta 65,536 credenciales. Si se llena, se crea otra automáticamente.
- **Irreversible**: una vez revocada (bit = 1), no se puede "des-revocar". Para reactivar habría que emitir una nueva credencial.
- **Privacidad**: el verifier solo ve la lista completa comprimida, no sabe qué credenciales pertenecen a qué holder (solo conoce el índice de la credencial que está verificando).
- **Performance**: la verificación es O(1) — descomprimir la lista y leer un bit.

## Fecha de implementación

2026-02-20
