# Docker - Credo Stack

## Levantar todos los servicios

Desde la raíz del proyecto:

```bash
docker compose up -d
```

Para ver los logs:

```bash
docker compose logs -f
```

## Servicios y puertos

| Servicio        | Puerto API | Puerto DIDComm | URL interna (entre contenedores)      |
|-----------------|------------|----------------|---------------------------------------|
| kms-service     | 4001       | -              | http://kms-service:4001               |
| wallet-service  | 4002       | -              | http://wallet-service:4002            |
| vdr-service     | 4003       | -              | http://vdr-service:4003               |
| issuer-service  | 3000       | 3001           | http://issuer-service:3000            |
| holder-service  | 9005       | 9205           | http://holder-service:9005            |
| verifier-service| 9004       | 9204           | http://verifier-service:9004          |

## Conectividad externa (wallets / pruebas)

Para que una wallet o cliente externo se conecte a los agentes (issuer, holder, verifier), los endpoints DIDComm deben ser accesibles desde fuera de Docker.

**Opción 1 - Localhost (solo desde la misma máquina):**

Crea un archivo `docker-compose.override.yml` con las variables ajustadas:

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

## Persistencia

Los volúmenes `kms-data`, `wallet-data` y `vdr-data` guardan las bases SQLite. Los datos persisten entre reinicios.

Para borrar todo y empezar de cero:

```bash
docker compose down -v
```

## Build sin caché

```bash
docker compose build --no-cache
```

## Detener

```bash
docker compose down
```
