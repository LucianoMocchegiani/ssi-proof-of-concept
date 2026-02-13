# Credo - Prueba de concepto SSI

**Prueba de concepto** para evaluar la tecnologia [Credo-TS](https://credo.js.org/), framework de identidad auto-soberana (SSI) y credenciales verificables.

## Intencion del proyecto

El objetivo es **simular un entorno real** donde Credo opera sobre **servicios externos** (agnosticos a Credo), en lugar de usar almacenamiento o criptografia locales embebidos. Esto permite:

- Validar la integracion de Credo con infraestructura distribuida
- Probar arquitecturas que separan KMS, storage y DID en servicios dedicados
- Facilitar el escalado y la operacion en produccion

## Arquitectura

Servicios agnosticos (KMS, storage, DID) y agentes Credo se comunican de forma independiente:

```
  +-----------------+   +-----------------+   +-----------------+
  |  kms-service    |   | storage-service |   |  did-service    |
  |  :4001          |   |  :4002          |   |  :4003          |
  |  (claves)       |   |  (registros)    |   |  (DIDs)         |
  +--------+--------+   +--------+--------+   +--------+--------+
           |                    |                    |
           +--------------------+--------------------+
                                |
              +-----------------+-----------------+
              |                 |                 |
        +-----v-----+     +-----v-----+     +-----v-----+
        | issuer    |     | holder    |     | verifier  |
        | :3000     |     | :9005     |     | :9004     |
        | (Credo)   |     | (Credo)   |     | (Credo)   |
        +-----------+     +-----------+     +-----------+
```

Cada agente (issuer, holder, verifier) se conecta directamente a los tres servicios.

---

## Servicios

### Servicios agnosticos (sin Credo)

| Servicio          | Puerto | Descripcion |
|-------------------|--------|-------------|
| **kms-service**   | 4001   | Gestion de claves: creacion, cifrado, descifrado. Expone API REST para keys, encrypt, decrypt. |
| **storage-service** | 4002 | Almacenamiento generico por (type, id). Credo persiste DidRecord, ConnectionRecord, OutOfBandRecord, etc. |
| **did-service**   | 4003   | Registro y resolucion de DIDs (ej. `did:custom`). Credo lo usa como DID resolver y registrar. |

### Servicios con Credo

| Servicio          | Puerto API / DIDComm | Descripcion |
|-------------------|----------------------|-------------|
| **issuer-service** | 3000 / 3001          | Emisor de credenciales. Crea invitaciones OOB, emite credenciales. |
| **holder-service**| 9005 / 9205           | Poseedor de credenciales. Recibe invitaciones, almacena credenciales. |
| **verifier-service** | 9004 / 9204        | Verificador. Crea invitaciones de presentacion, verifica credenciales. |

---

## Levantar con Docker

### Requisitos

- Docker y Docker Compose

### Ejecutar

```bash
docker compose up -d --build
```

### Verificar

```bash
# Health checks
curl http://localhost:4001/health  # kms
curl http://localhost:4002/health  # storage
curl http://localhost:4003/health  # did
curl http://localhost:3000/health  # issuer
curl http://localhost:9005/health  # holder
curl http://localhost:9004/health  # verifier
```

### Flujo basico (OOB + DIDComm)

1. **Crear invitacion** (issuer):
   ```bash
   curl -X POST http://localhost:3000/create-invitation \
     -H "Content-Type: application/json" \
     -d '{"serviceHost":"localhost","port":3000}'
   ```
   Respuesta: `invitation` (URL `didcomm://?oob=...`).

2. **Recibir invitacion** (holder):
   ```bash
   curl -X POST http://localhost:9005/receive-invitation \
     -H "Content-Type: application/json" \
     -d '{"invitationUrl":"<invitation del paso 1>"}'
   ```

### Coleccion Postman

Para probar el flujo con Postman, importa la coleccion:

- **`postman/Issuer-Holder-Connection.postman_collection.json`**

Incluye los requests para crear invitacion (issuer) y recibirla (holder). La variable `invitationUrl` se rellena automaticamente entre pasos. Ver `postman/README.md` para mas detalles.

---

## Desarrollo local

```bash
# Instalar dependencias en cada servicio
cd issuer-service && npm install
cd ../holder-service && npm install
cd ../verifier-service && npm install
cd ../kms-service && npm install
cd ../storage-service && npm install
cd ../did-service && npm install

# Levantar servicios agnosticos primero
# Luego issuer, holder, verifier
```

Variables de entorno relevantes:
- `USE_REMOTE_KMS` / `REMOTE_KMS_URL`
- `USE_REMOTE_STORAGE` / `REMOTE_STORAGE_URL`
- `DID_SERVICE_URL`

---

## Tecnologias

- [Credo-TS](https://credo.js.org/) - Framework SSI
- NestJS - API REST
- SQLite - Persistencia en kms, storage y did
- Docker - Orquestacion
