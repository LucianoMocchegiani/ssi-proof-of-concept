# Wallet Service

## ¿Qué es?

El **wallet-service** es el **servicio de persistencia de registros del wallet**. Ofrece un CRUD genérico key-value por `type` e `id`. Es agnóstico a Credo: cualquier sistema puede usarlo para almacenar datos estructurados.

En este diseño, el wallet-service **reemplaza la parte de almacenamiento de Askar** cuando Credo necesita guardar conexiones, credenciales, DIDs y demás registros.

---

## Modos de operación (internal / external)

Los agentes (issuer, holder, verifier) pueden usar el wallet en dos modos:

| Modo | Adapter | Descripción |
|------|---------|-------------|
| **internal** | `InternalWalletStorageService` | SQLite local en el proceso del agente (better-sqlite3). No requiere wallet-service externo. |
| **external** | `ExternalWalletStorageService` | Delega al wallet-service centralizado via HTTP. |

Se configura con `WALLET_MODE=internal` o `WALLET_MODE=external`.

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

## ¿Qué NO hace el Wallet?

- **No maneja claves** ni operaciones criptográficas → eso es del KMS
- **No resuelve DIDs** → solo guarda los documentos; el DID Resolver los lee
- **No valida** el contenido de `data` → es un almacén genérico

---

## ¿Qué se almacena?

El wallet guarda **registros** identificados por `type` e `id`. Algunos tipos usados por Credo:

| Type | Descripción |
|------|-------------|
| `ConnectionRecord` | Conexiones DIDComm entre agentes |
| `DidRecord` | Metadata de DIDs creados por el agente (keys, referencias) |
| `CredentialExchangeRecord` | Intercambio de credenciales (offer, request, issue) |
| `ProofExchangeRecord` | Intercambio de pruebas/presentaciones |
| `StorageVersionRecord` | Versión del framework (migraciones) |
| Otros tipos de Credo | Mediation, etc. |

**Nota**: Los documentos DID (`DidDocument`) se almacenan en **vdr-service**, no en el wallet. Esto emula la realidad: los documentos públicos viven en un registro separado (web, blockchain, etc.).

Cada registro tiene:
- **type**: tipo/categoría del registro
- **id**: identificador único
- **data**: objeto JSON (estructura depende del tipo)

---

## API REST (endpoints del wallet-service externo)

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

- **wallet-service (externo)**: SQLite en `./data/wallet.sqlite`
- **internal mode**: SQLite en la ruta configurada por `INTERNAL_WALLET_SQLITE_PATH`
- **Tabla `records`**: `type`, `id`, `data` (PRIMARY KEY type, id)
- **Producción**: PostgreSQL, MongoDB, o cualquier base de datos escalable

---

## Integración con Credo

El agente usa `ExternalWalletStorageService` (modo external) o `InternalWalletStorageService` (modo internal), ambos implementan la interfaz `StorageService` de Credo. Traducen:

- `save(record)` → INSERT/POST `/records` con `type`, `id`, `data`
- `getById(recordClass, id)` → SELECT/GET `/records/:type/:id`
- `getAll(recordClass)` → SELECT ALL/GET `/records/:type`
- `update(record)` → UPDATE/PUT `/records/:type/:id`
- `delete(record)` → DELETE `/records/:type/:id`
- `findByQuery(...)` → SELECT + filter / POST `/records/query`

---

## Seguridad del acceso

El wallet contiene datos sensibles (credenciales, conexiones). Hay que restringir quién puede acceder:

| Medida | Descripción |
|--------|-------------|
| **CORS** | Restringir orígenes permitidos: solo los frontends/componentes que nosotros controlamos. |
| **Red** | El wallet-service debe estar en red privada. Solo issuer-service, holder-service y verifier-service deben poder alcanzarlo. |
| **Sin exposición pública** | No exponer el wallet-service en internet. Solo acceso interno entre servicios. |
| **Autenticación** *(recomendado)* | API key, mTLS o token: solo los servicios autorizados pueden autenticarse. |

---

## Variables de entorno

### wallet-service (servicio centralizado)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `WALLET_SERVICE_PORT` | 4002 | Puerto HTTP |
| `WALLET_SQLITE_PATH` | `./data/wallet.sqlite` | Ruta del archivo SQLite |

### Agentes (issuer, holder, verifier)

| Variable | Default | Descripción |
|----------|---------|-------------|
| `WALLET_MODE` | `internal` | Modo: `internal` o `external` |
| `EXTERNAL_WALLET_URL` | `http://localhost:4002` | URL del wallet-service (modo external) |
| `INTERNAL_WALLET_SQLITE_PATH` | `/app/data/internal-wallet.sqlite` | Ruta SQLite local (modo internal) |
