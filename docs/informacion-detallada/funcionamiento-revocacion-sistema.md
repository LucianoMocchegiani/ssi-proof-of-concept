# Funcionamiento de la Revocación en Nuestro Sistema

Documento que describe cómo está implementada la revocación de credenciales a través de los tres servicios (issuer, holder, verifier) y el VDR.

> Para la teoría del mecanismo StatusList, ver [revocacion-statuslist.md](./revocacion-statuslist.md).
> Para la limitación de Credo-TS con `credentialStatus`, ver [credentialstatus-jsonld-no-soportado.md](../dudas/credentialstatus-jsonld-no-soportado.md).

---

## Arquitectura general

La revocación usa **mapeo externo** en el VDR. Credo-TS no soporta `credentialStatus` en credenciales JSON-LD, así que la credencial se emite limpia y el mapeo `credentialId → statusListIndex` se almacena en el VDR.

```
┌─────────────┐     ┌─────────────────────────────────┐     ┌─────────────┐     ┌─────────────┐
│   Issuer     │     │           VDR                    │     │   Holder    │     │  Verifier   │
│              │     │  StatusList (bitstring)          │     │             │     │             │
│ Credentials  │────>│  credential_status_map (mapeo)   │<────│ Credentials │     │ Proof       │
│  Service     │     │                                  │<────│  Service    │     │ Listener    │────>VDR
│              │     │  allocate / revoke / query        │     │             │     │             │
└─────────────┘     └─────────────────────────────────┘     └─────────────┘     └─────────────┘
```

---

## Por qué mapeo externo

Credo-TS bloquea `credentialStatus` en credenciales JSON-LD:
- En el body de la VC: `"Verifying credential status for JSON-LD credentials is currently not supported"`
- En las options: `"Some fields are not currently supported in credential options: credentialStatus"`

No hay workaround sin monkey-patching. La solución: la VC se emite **sin** `credentialStatus` y el mapeo vive en el VDR.

---

## 1. Inicialización del Issuer

**Archivo:** `issuer-service/src/main.ts`

Al arrancar:
1. Inicializa el agente Credo
2. Crea o recupera su DID (`ensureIssuerDid`)
3. Crea o recupera una StatusList (`ensureStatusList`)
4. Guarda la info en memoria (`setStatusList`)

---

## 2. Emisión con soporte de revocación

**Archivo:** `issuer-service/src/credentials/credentials.service.ts`

Cuando se llama a `POST /offer-credential`:

### Paso 1: Reservar un índice

```
allocateStatusIndex()
  → POST vdr/status/list/{id}/allocate
  → { statusListIndex: 42, statusListId: "abc-123" }
```

### Paso 2: Emitir la credencial SIN credentialStatus

La VC se arma con `id: "urn:uuid:xxx"` pero **sin** el campo `credentialStatus`:

```json
{
  "@context": ["https://www.w3.org/2018/credentials/v1", ...],
  "id": "urn:uuid:abc-def-123",
  "type": ["VerifiableCredential", "GenericCredential"],
  "issuer": "did:custom:issuer-xxx",
  "issuanceDate": "2026-02-20T12:00:00Z",
  "credentialSubject": { "id": "did:custom:holder-yyy", "name": "Juan" }
}
```

### Paso 3: Registrar mapeo en el VDR

Después de emitir exitosamente:

```
registerCredentialMapping(credentialId, statusListId, statusListIndex)
  → POST vdr/status/credential-map
  → body: { credentialId: "urn:uuid:abc-def-123", statusListId: "abc-123", statusListIndex: 42 }
```

El VDR guarda el mapeo en la tabla `credential_status_map`.

### Paso 4: Retornar al caller

```json
{
  "credentialExchangeId": "8a7afedb-...",
  "state": "offer-sent",
  "credentialId": "urn:uuid:abc-def-123",
  "statusListIndex": 42
}
```

---

## 3. Revocación de una credencial

**Endpoint:** `POST /revoke-credential`

Sin cambios respecto al flujo anterior. El issuer conoce el `statusListIndex` (desde la response de emisión) y llama al VDR:

```
POST vdr/status/list/{listId}/revoke  body: { statusListIndex: 42 }
→ VDR: bit[42] = 1
```

---

## 4. Verificación automática por el Verifier

**Archivo:** `verifier-service/src/agent/agent-verifier.ts`

Cuando el estado del proof cambia a `PresentationReceived`:

### Flujo actualizado

```
1. extractCredentialIds(agent, proofRecordId)
   → Extrae los IDs (urn:uuid:xxx) de las VCs presentadas
   → Ya NO busca credentialStatus (no existe en la VC)

2. Para cada credentialId:
   checkCredentialRevocation(credentialId)
   → GET vdr/status/credential/{credentialId}/revoked
   → VDR busca el mapeo → lee el bit en la StatusList
   → Retorna { revoked: true/false, statusListId, statusListIndex }

3. Decisión:
   → Si alguna VC está revocada → REVOKED + problem report al holder
   → Si ninguna está revocada → acceptPresentation() + VERIFIED
   → Si no hay mapeo (404) → se considera no revocable, se acepta
```

---

## 5. Consulta de estado por el Holder

**Endpoint:** `GET /credential-status/:id`

El holder consulta directamente al VDR por el credential ID:

```
GET vdr/status/credential/{credentialId}/revoked
→ { revoked: true/false }
```

Ya no necesita buscar la credencial en su wallet ni leer `credentialStatus`.

---

## Resumen de endpoints

### Issuer (`issuer-service`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/offer-credential` | Emite VC + registra mapeo en VDR |
| POST | `/revoke-credential` | Revoca por `statusListIndex` |

### Holder (`holder-service`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/credential-status/:id` | Consulta revocación por credentialId |

### VDR (`vdr-service`)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/status/list` | Crear StatusList |
| POST | `/status/list/:id/allocate` | Reservar índice |
| POST | `/status/list/:id/revoke` | Revocar índice (bit → 1) |
| GET | `/status/revoked/:listId/:index` | Consultar bit por índice |
| POST | `/status/credential-map` | Registrar mapeo credentialId → índice |
| GET | `/status/credential/:id/revoked` | Consultar revocación por credentialId |

### Verifier (`verifier-service`)

Sin endpoints. Verificación automática en el listener de proof.

---

## Diagrama de secuencia

```
                 EMISIÓN                                           REVOCACIÓN              VERIFICACIÓN

  Issuer              VDR                  Holder                                  Holder       Verifier      VDR
    │                  │                     │                                       │            │            │
    │ POST /allocate   │                     │                                       │            │            │
    │─────────────────>│                     │                                       │            │            │
    │ {index: 42}      │                     │                                       │            │            │
    │<─────────────────│                     │                                       │            │            │
    │                  │                     │                                       │            │            │
    │ VC sin credentialStatus (id=urn:uuid:abc)                                      │            │            │
    │────────────────────────────────────────>│                                       │            │            │
    │                  │                     │                                       │            │            │
    │ POST /credential-map                   │                                       │            │            │
    │  {credentialId, statusListId, index}   │                                       │            │            │
    │─────────────────>│ guarda mapeo        │                                       │            │            │
    │ {ok: true}       │                     │                                       │            │            │
    │<─────────────────│                     │                                       │            │            │
    │                  │                     │                                       │            │            │
    │ POST /revoke     │                     │                                       │            │            │
    │─────────────────>│ bit[42] = 1         │                                       │            │            │
    │ {ok: true}       │                     │                                       │            │            │
    │<─────────────────│                     │                                       │            │            │
    │                  │                     │                                       │            │            │
    │                  │                     │                                       │ Proof      │            │
    │                  │                     │                                       │───────────>│            │
    │                  │                     │                                       │            │ GET        │
    │                  │                     │                                       │            │ /credential│
    │                  │                     │                                       │            │ /abc/revoked
    │                  │                     │                                       │            │───────────>│
    │                  │                     │                                       │            │{revoked:T} │
    │                  │                     │                                       │            │<───────────│
    │                  │                     │                                       │ RECHAZADA  │            │
    │                  │                     │                                       │<───────────│            │
```

---

## Tablas en el VDR (SQLite)

### `status_lists` (bitstring de revocación)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | TEXT PK | UUID de la lista |
| issuer_id | TEXT | DID del issuer |
| purpose | TEXT | `'revocation'` |
| encoded_list | TEXT | Base64(gzip(bitstring)) |
| size | INTEGER | Total de bits (65,536) |
| next_index | INTEGER | Próximo índice libre |
| updated_at | INTEGER | Timestamp |

### `credential_status_map` (mapeo externo)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| credential_id | TEXT PK | ID de la VC (urn:uuid:xxx) |
| status_list_id | TEXT | UUID de la StatusList |
| status_list_index | INTEGER | Índice en la StatusList |
| created_at | INTEGER | Timestamp de registro |

---

## Consideraciones de diseño

1. **Mapeo externo obligatorio**: Credo-TS no soporta `credentialStatus` en JSON-LD. No es un workaround nuestro — es una limitación del framework.

2. **VC limpia**: La credencial no tiene ningún campo de revocación, lo que la hace compatible con cualquier versión de Credo.

3. **VDR como fuente de verdad**: Tanto el mapeo como la StatusList viven en el VDR. Ningún servicio necesita mantener estado local de revocación.

4. **Degradación graceful**: Si el VDR no está disponible al emitir, la credencial se emite sin soporte de revocación (sin mapeo).

5. **Migración futura**: Cuando Credo soporte `credentialStatus` en JSON-LD (o se migre a SD-JWT), se puede embeber el campo en la VC y eliminar la tabla `credential_status_map`.
