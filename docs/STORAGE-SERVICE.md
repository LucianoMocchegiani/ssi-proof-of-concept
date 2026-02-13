# Storage Service

## ¿Qué es?

El **Storage-service** es el **servicio de persistencia de registros**. Ofrece un CRUD genérico key-value por `type` e `id`. Es agnóstico a Credo: cualquier sistema puede usarlo para almacenar datos estructurados.

En este diseño, el Storage **reemplaza la parte de almacenamiento de Askar** cuando Credo necesita guardar conexiones, credenciales, DIDs y demás registros.

---

## Responsabilidades

| Operación | Descripción |
|-----------|-------------|
| **Guardar** | Inserta o reemplaza un registro (`type`, `id`, `data`) |
| **Obtener por ID** | Devuelve un registro por `type` e `id` |
| **Obtener todos** | Lista todos los registros de un `type` |
| **Actualizar** | Actualiza el `data` de un registro existente |
| **Borrar** | Elimina un registro |
| **Consulta** | Lista registros por `type` (query simple) |

---

## ¿Qué NO hace el Storage?

- **No maneja claves** ni operaciones criptográficas → eso es del KMS
- **No resuelve DIDs** → solo guarda los documentos; el DID Resolver los lee
- **No valida** el contenido de `data` → es un almacén genérico

---

## ¿Qué se almacena?

El Storage guarda **registros** identificados por `type` e `id`. Algunos tipos usados por Credo:

| Type | Descripción |
|------|-------------|
| `ConnectionRecord` | Conexiones DIDComm entre agentes |
| `DidRecord` | Metadata de DIDs creados por el agente (keys, referencias) |
| `CredentialExchangeRecord` | Intercambio de credenciales (offer, request, issue) |
| `ProofExchangeRecord` | Intercambio de pruebas/presentaciones |
| `StorageVersionRecord` | Versión del framework (migraciones) |
| Otros tipos de Credo | Mediation, etc. |

**Nota**: Los documentos DID (`DidDocument`) se almacenan en **did-service**, no en Storage. Esto emula la realidad: los documentos públicos viven en un registro separado (web, blockchain, etc.).

Cada registro tiene:
- **type**: tipo/categoría del registro
- **id**: identificador único
- **data**: objeto JSON (estructura depende del tipo)

---

## API REST (endpoints)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/records` | Crear (body: `{ type, id?, data }`) |
| GET | `/records/:type/:id` | Obtener por type e id |
| GET | `/records/:type` | Listar todos los registros de un type |
| PUT | `/records/:type/:id` | Actualizar (body: `{ data }`) |
| DELETE | `/records/:type/:id` | Borrar |
| POST | `/records/query` | Query por type (body: `{ type, query? }`) |

---

## Persistencia

- **POC**: SQLite en `./data/storage.sqlite`
- **Tabla `records`**: `type`, `id`, `data` (PRIMARY KEY type, id)
- **Producción**: PostgreSQL, MongoDB, o cualquier base de datos escalable

---

## Integración con Credo

El agente usa el adaptador `RemoteStorageService`, que implementa la interfaz `StorageService` de Credo. Traduce:

- `save(record)` → POST `/records` con `type`, `id`, `data`
- `getById(recordClass, id)` → GET `/records/:type/:id`
- `getAll(recordClass)` → GET `/records/:type`
- `update(record)` → PUT `/records/:type/:id`
- `delete(record)` → DELETE `/records/:type/:id`
- `findByQuery(...)` → POST `/records/query`

---

## Seguridad del acceso

El Storage contiene datos sensibles (credenciales, conexiones). Hay que restringir quién puede acceder:

| Medida | Descripción |
|--------|-------------|
| **CORS** | Restringir orígenes permitidos: solo los frontends/componentes que nosotros controlamos. Si ningún navegador debe llamar al storage directamente, deshabilitar CORS o bloquear todos los orígenes. |
| **Red** | El storage debe estar en red privada. Solo issuer-service, holder-service y verifier-service (y componentes autorizados) deben poder alcanzarlo. Firewall / VPC. |
| **Sin exposición pública** | No exponer el storage en internet. Solo acceso interno entre servicios. |
| **Autenticación** *(recomendado)* | API key, mTLS o token: solo los servicios autorizados pueden autenticarse. |

**Nota**: CORS aplica a peticiones desde el navegador. Las llamadas issuer/holder/verifier → storage son servidor a servidor; para esas, la red aislada y la autenticación son lo crítico.

---

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 4002 | Puerto HTTP |
| `STORAGE_SQLITE_PATH` | `./data/storage.sqlite` | Ruta del archivo SQLite |
| `NODE_ENV` | development | Entorno |

---

## Uso por otros servicios

- **Issuer/Verifier controller**: puede consultar registros vía GET directo (por ejemplo, `/issue` busca en storage)
- **Cualquier servicio**: puede usar la API genérica para sus propios `type`/`id`/`data`

**Nota**: Los documentos DID se gestionan en **did-service** (ver `docs/DID-SERVICE.md`).
