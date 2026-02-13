# DID Service

## ¿Qué es?

El **did-service** es el **registro de documentos DID**. Almacena y sirve los documentos DID de forma separada del Storage del agente. Emula la realidad: en producción los documentos DID viven en la web, blockchain o un registro público; no en el mismo almacén que las conexiones y credenciales del agente.

---

## Responsabilidades

| Operación | Descripción |
|-----------|-------------|
| **Registrar** | Guarda un documento DID por `id` |
| **Resolver** | Devuelve un documento DID por `id` |
| **did.json** | Sirve documentos en formato did:web (`/:id/did.json`) |

---

## ¿Qué NO hace?

- **No maneja claves** → eso es del KMS
- **No guarda metadata del agente** (DidRecord, ConnectionRecord, etc.) → eso es del Storage
- **No valida** el contenido del documento → es un almacén dedicado a DIDs

---

## Métodos DID soportados

| Método | Uso |
|--------|-----|
| **did:custom** | Resolver y Registrar usan did-service |
| **did:web** | Resolver y Registrar usan did-service (emula la web) |

---

## API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/did` | Registrar (body: `{ id, document }`) |
| GET | `/did/:id` | Obtener documento por id |
| GET | `/:id/did.json` | Formato did:web (Content-Type: application/did+json) |

---

## Persistencia

- **SQLite**: `./data/did.sqlite`
- **Tabla `documents`**: `id` (TEXT PRIMARY KEY), `document` (TEXT JSON)

---

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `DID_SERVICE_PORT` | 4003 | Puerto HTTP |
| `DID_SQLITE_PATH` | `./data/did.sqlite` | Ruta del archivo SQLite |

---

## Integración

Los adapters del issuer-service (CustomDidResolver, CustomDidRegistrar, WebDidResolver, WebDidRegistrar) usan `DID_SERVICE_URL` (default: `http://localhost:4003`) para comunicarse con el servicio.

---

## Arquitectura

```
Agent (Credo)          did-service              Storage
     |                      |                       |
DidRecord (metadata) ──>  (no)                 ──> sí
DidDocument (público) ──>  sí                   ──> no
```
