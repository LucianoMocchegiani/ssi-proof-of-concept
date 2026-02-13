# Instrucciones - Stack Credo con Docker

Guía para levantar, usar y mantener el stack completo de servicios.

---

## Servicios incluidos

| Servicio | Puerto(s) | Descripción |
|----------|-----------|-------------|
| **kms-service** | 4001 | Gestión de claves (crear, firmar, cifrar) |
| **storage-service** | 4002 | Persistencia de registros (Conexiones, DIDs, credenciales) |
| **did-service** | 4003 | Registro y resolución de DIDs `did:custom` |
| **issuer-service** | 3000, 3001 | Emite credenciales, crea invitaciones OOB |
| **holder-service** | 9005, 9205 | Recibe credenciales, acepta invitaciones |
| **verifier-service** | 9004, 9204 | Verifica credenciales y presentaciones |

---

## Requisitos previos

- **Docker** y **Docker Compose** instalados
- Puertos 3000, 3001, 4001, 4002, 4003, 9004, 9204, 9005, 9205 libres

---

## Levantar el stack

```bash
# Desde la raíz del proyecto (credo/)
docker compose up -d
```

Espera unos segundos a que los healthchecks de kms, storage y did estén en verde. Luego issuer, holder y verifier se iniciarán.

---

## Verificar que todo funciona

```bash
# Estado de contenedores
docker compose ps

# Health de servicios base
curl http://localhost:4001/health   # KMS
curl http://localhost:4002/health   # Storage
curl http://localhost:4003/health   # DID

# Health del issuer (incluye agentReady)
curl http://localhost:3000/health
```

Si `agentReady` es `true`, el issuer está listo para crear invitaciones.

---

## Flujo Issuer ↔ Holder (conexión)

1. **Issuer crea invitación**
   ```http
   POST http://localhost:3000/create-invitation
   Content-Type: application/json

   { "serviceHost": "localhost", "port": 3000 }
   ```
   Respuesta: `{ "invitation": "http://localhost:3000/?c_i=..." }`

2. **Holder recibe invitación**
   ```http
   POST http://localhost:9005/receive-invitation
   Content-Type: application/json

   { "invitationUrl": "<URL del paso 1>" }
   ```
   Respuesta: `{ "ok": true, "outOfBandRecordId": "..." }`

Ver colección Postman en `postman/Issuer-Holder-Connection.postman_collection.json`.

---

## Comandos útiles

| Acción | Comando |
|--------|---------|
| Ver logs de todo | `docker compose logs -f` |
| Logs de un servicio | `docker compose logs -f issuer-service` |
| Reiniciar un servicio | `docker compose restart issuer-service` |
| Reiniciar todo | `docker compose restart` |
| Rebuild tras cambios | `docker compose up -d --build` |
| Detener todo | `docker compose down` |
| Detener y borrar volúmenes | `docker compose down -v` |

---

## Variables de entorno (por servicio)

Los valores por defecto ya están en el `docker-compose.yml`. Solo ajusta si usas otros hosts o puertos.

| Variable | Issuer | Holder | Verifier | Descripción |
|----------|--------|--------|----------|-------------|
| `REMOTE_KMS_URL` | http://kms-service:4001 | idem | idem | URL del KMS |
| `REMOTE_STORAGE_URL` | http://storage-service:4002 | idem | idem | URL del Storage |
| `DID_SERVICE_URL` | http://did-service:4003 | idem | idem | URL del DID registry |
| `USE_REMOTE_KMS` | true | true | true | Usar KMS remoto |
| `USE_REMOTE_STORAGE` | true | true | true | Usar Storage remoto |

---

## Persistencia

Los datos se guardan en volúmenes:

- `kms-data` → claves del KMS (SQLite)
- `storage-data` → registros Credo (conexiones, credenciales, etc.) por walletId
- `did-data` → documentos DID (`did:custom`)

Para empezar de cero:

```bash
docker compose down -v
docker compose up -d
```

---

## Troubleshooting

### "No issuer agent initialized"
- El agente no terminó de inicializar. Revisa logs: `docker compose logs issuer-service`
- Causas frecuentes: Storage/KMS/DID no accesibles, o error en migración de storage.
- Espera 10–15 s y vuelve a llamar a `/create-invitation`.

### Error 404 en Storage
- Revisa que storage-service esté levantado y en `http://storage-service:4002` (o localhost:4002).
- Revisa `USE_REMOTE_STORAGE=true` en los agentes.

### Error "record.clone is not a function"
- Ya no debería ocurrir tras las correcciones al RemoteStorageService (serialización con `toJSON` y deserialización con `JsonTransformer.fromJSON`).
- Si aparece, haz rebuild: `docker compose up -d --build`.
