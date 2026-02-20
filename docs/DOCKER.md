# Docker 

Hay dos formas de levantar el proyecto, según el modo de operación deseado.

---

## Opcion 1: Modo realista (default)

**Archivo:** `docker-compose.yml`

Levanta **6 servicios**: 3 de infraestructura (kms-service, wallet-service, vdr-service) + 3 agentes (issuer, holder, verifier). El issuer y verifier usan KMS y Wallet **externos** (HTTP al servicio centralizado). El holder usa KMS y Wallet **internos** (cripto y storage local). Simula un escenario real donde el issuer/verifier son institucionales y el holder es personal.

```bash
docker compose up -d
```

| Servicio | Modo KMS | Modo Wallet | Descripcion |
|----------|----------|-------------|-------------|
| kms-service | - | - | Motor criptografico centralizado |
| wallet-service | - | - | Persistencia de records centralizada |
| vdr-service | - | - | Registro de DIDs (compartido) |
| issuer-service | external | external | Agente emisor (usa servicios centralizados) |
| holder-service | internal | internal | Agente titular (todo local) |
| verifier-service | external | external | Agente verificador (usa servicios centralizados) |

---

## Opcion 2: Modo todo interno

**Archivo:** `docker-compose-internal-mode.yml`

Levanta **4 servicios**: solo vdr-service + 3 agentes. Todos los agentes usan KMS y Wallet **internos** (cripto y storage local con SQLite propio). No necesita kms-service ni wallet-service. Cada agente es autónomo. Útil para desarrollo y pruebas rápidas.

```bash
docker compose -f docker-compose-internal-mode.yml up -d
```

| Servicio | Modo KMS | Modo Wallet | Descripcion |
|----------|----------|-------------|-------------|
| vdr-service | - | - | Registro de DIDs (compartido) |
| issuer-service | internal | internal | Agente emisor (todo local) |
| holder-service | internal | internal | Agente titular (todo local) |
| verifier-service | internal | internal | Agente verificador (todo local) |

> El VDR siempre es externo porque los DIDs deben estar en un registro compartido para que todos los agentes los puedan resolver.

---

## Servicios y puertos

| Servicio | Puerto | URL interna (entre contenedores) | Solo en |
|----------|--------|----------------------------------|---------|
| kms-service | 4001 | http://kms-service:4001 | Modo realista |
| wallet-service | 4002 | http://wallet-service:4002 | Modo realista |
| vdr-service | 4003 | http://vdr-service:4003 | Ambos |
| issuer-service | 3000 | http://issuer-service:3000 | Ambos |
| holder-service | 9005 | http://holder-service:9005 | Ambos |
| verifier-service | 9004 | http://verifier-service:9004 | Ambos |

---

## Comandos frecuentes

### Levantar

```bash
# Modo realista (default)
docker compose up -d

# Modo todo interno
docker compose -f docker-compose-internal-mode.yml up -d
```

### Detener

```bash
# Modo realista
docker compose down

# Modo todo interno
docker compose -f docker-compose-internal-mode.yml down
```

### Detener y borrar volumenes (reset completo)

Borra las bases SQLite (claves, records, DIDs). El sistema arranca de cero.

```bash
# Modo realista
docker compose down -v

# Modo todo interno
docker compose -f docker-compose-internal-mode.yml down -v
```

### Build sin cache

Fuerza rebuild completo de las imagenes (útil después de cambios en dependencias o Dockerfile).

```bash
# Todos los servicios
docker compose build --no-cache

# Solo algunos servicios
docker compose build --no-cache holder-service issuer-service verifier-service

# Con el compose interno
docker compose -f docker-compose-internal-mode.yml build --no-cache
```

### Build + levantar en un solo paso

```bash
docker compose up -d --build
```

### Logs

```bash
# Todos los servicios (seguir en tiempo real)
docker compose logs -f

# Un servicio específico
docker compose logs -f holder-service
docker compose logs -f issuer-service
docker compose logs -f verifier-service
docker compose logs -f kms-service
docker compose logs -f wallet-service
docker compose logs -f vdr-service

# Por nombre de contenedor (útil si tenés multiples compose)
docker logs -f credo-holder-service-1
docker logs -f credo-issuer-service-1
docker logs -f credo-verifier-service-1
docker logs -f credo-kms-service-1
docker logs -f credo-wallet-service-1
docker logs -f credo-vdr-service-1

# Últimas N líneas
docker compose logs --tail=100 holder-service

# Con el compose interno
docker compose -f docker-compose-internal-mode.yml logs -f
docker compose -f docker-compose-internal-mode.yml logs -f holder-service
```

### Restart

```bash
# Un servicio
docker compose restart holder-service
docker compose restart issuer-service

# Todos
docker compose restart

# Con el compose interno
docker compose -f docker-compose-internal-mode.yml restart holder-service
```

### Estado de los contenedores

```bash
docker compose ps
docker compose -f docker-compose-internal-mode.yml ps
```

### Entrar a un contenedor (debug)

```bash
docker exec -it credo-holder-service-1 sh
docker exec -it credo-issuer-service-1 sh
```

### Limpiar imagenes y contenedores huerfanos

```bash
# Eliminar contenedores huérfanos de compose anteriores
docker compose down --remove-orphans

# Limpiar imágenes sin usar
docker image prune -f

# Limpieza total (imagenes, containers, volumes sin uso)
docker system prune -a --volumes
```

---

## Persistencia

### Modo realista

| Volumen | Servicio | Contenido |
|---------|----------|-----------|
| `kms-data` | kms-service | Claves criptográficas (kms.sqlite) |
| `wallet-data` | wallet-service | Records de agentes (wallet.sqlite) |
| `vdr-data` | vdr-service | DIDs registrados (vdr.sqlite) |
| `issuer-kms-data` | issuer-service | SQLite local del issuer (solo si usa internal) |
| `holder-kms-data` | holder-service | KMS + Wallet SQLite local del holder |
| `verifier-kms-data` | verifier-service | SQLite local del verifier (solo si usa internal) |

### Modo todo interno

| Volumen | Servicio | Contenido |
|---------|----------|-----------|
| `vdr-data` | vdr-service | DIDs registrados (vdr.sqlite) |
| `issuer-data` | issuer-service | internal-kms.sqlite + internal-wallet.sqlite |
| `holder-data` | holder-service | internal-kms.sqlite + internal-wallet.sqlite |
| `verifier-data` | verifier-service | internal-kms.sqlite + internal-wallet.sqlite |

---

## Conectividad externa (wallets / pruebas)

Para que una wallet o cliente externo se conecte a los agentes, los endpoints DIDComm deben ser accesibles desde fuera de Docker.

**Opción 1 - Localhost (solo desde la misma máquina):**

Crea un archivo `docker-compose.override.yml`:

```yaml
services:
  issuer-service:
    environment:
      DIDCOMM_ENDPOINT: http://localhost:3000
  holder-service:
    environment:
      DIDCOMM_ENDPOINT: http://localhost:9005
  verifier-service:
    environment:
      DIDCOMM_ENDPOINT: http://localhost:9004
```

**Opción 2 - IP/hostname de la máquina:**

Usa la IP de tu máquina o `host.docker.internal` (Windows/Mac) para que las invitaciones funcionen desde cualquier cliente en la red.
