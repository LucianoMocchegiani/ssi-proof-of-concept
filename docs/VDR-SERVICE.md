# VDR Service (Verifiable Data Registry)

## Que es?

El **vdr-service** es el **registro de datos verificables**. Almacena y sirve documentos DID y puede extender con StatusList (revocacion) y otros objetos AnonCreds. Emula un VDR tipo Indy/Cheqd pero via HTTP sin blockchain.

Actualmente incluye:
- **DID Documents**: registro y resolucion de did:custom y did:web
- **StatusList** (planeado): para revocacion de credenciales W3C

---

## Responsabilidades

| Operacion | Descripcion |
|-----------|-------------|
| **Registrar DID** | Guarda un documento DID por `id` |
| **Resolver DID** | Devuelve un documento DID por `id` |
| **did.json** | Sirve documentos en formato did:web (`/:id/did.json`) |

---

## Que NO hace?

- **No maneja claves** -> eso es del KMS
- **No guarda metadata del agente** (DidRecord, ConnectionRecord, etc.) -> eso es del Storage
- **No valida** el contenido del documento -> es un almacen dedicado

---

## Metodos DID soportados

| Metodo | Uso |
|--------|-----|
| **did:custom** | Resolver y Registrar usan vdr-service |
| **did:web** | Resolver y Registrar usan vdr-service (emula la web) |

---

## API REST

### DIDs

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/did` | Registrar (body: `{ id, document }`) |
| POST | `/did/delete` | Eliminar DID (body: `{ id }`). Para DIDs huérfanos (clave perdida en MockKMS). |
| GET | `/did/:id` | Obtener documento por id |
| GET | `/:id/did.json` | Formato did:web (Content-Type: application/did+json) |

### StatusList (revocacion W3C)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| POST | `/status/list` | Crear lista. Body: `{ issuerId? }`. Retorna `{ id, url }` |
| GET | `/status/list/:id` | Obtener StatusList (encodedList, size) para verificar bit |
| POST | `/status/list/:id/revoke` | Revocar indice. Body: `{ statusListIndex }` |

---

## Persistencia

- **SQLite**: `./data/vdr.sqlite`
- **Tabla `documents`**: `id` (TEXT PRIMARY KEY), `document` (TEXT JSON)

---

## Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `VDR_SERVICE_PORT` | 4003 | Puerto HTTP |
| `VDR_SQLITE_PATH` | `./data/vdr.sqlite` | Ruta del archivo SQLite |

---

## Integracion

Los adapters del issuer, holder y verifier (CustomDidResolver, CustomDidRegistrar, WebDidResolver, WebDidRegistrar) usan `VDR_SERVICE_URL` (default: `http://localhost:4003`) para comunicarse con el servicio.

---

## Arquitectura

```
Agent (Credo)          vdr-service              Storage
     |                      |                       |
DidRecord (metadata) ──>  (no)                 ──> si
DidDocument (publico) ──>  si                   ──> no
```

---

## Extension futura (StatusList, AnonCreds)

Ver `docs/extender-vdr-service.md` para plan de extension con StatusList2021 (revocacion W3C) y objetos AnonCreds.
