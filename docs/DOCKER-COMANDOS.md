# Docker - Comandos útiles

Desde la raíz del proyecto (`credo/`).

## Ver logs

```bash
# Todos los servicios en tiempo real
docker compose logs -f

# Un servicio específico
docker compose logs -f kms-service
docker compose logs -f storage-service
docker compose logs -f did-service
docker compose logs -f issuer-service
docker compose logs -f holder-service
docker compose logs -f verifier-service

# Últimas N líneas (sin -f)
docker compose logs --tail 100 issuer-service
```

## Reiniciar servicios

```bash
# Reiniciar un servicio
docker compose restart kms-service
docker compose restart storage-service
docker compose restart did-service
docker compose restart issuer-service
docker compose restart holder-service
docker compose restart verifier-service

# Reiniciar varios
docker compose restart kms-service storage-service did-service

# Reiniciar todo el stack
docker compose restart
```

## Otros

```bash
# Estado de contenedores
docker compose ps

# Levantar
docker compose up -d

# Detener
docker compose down

# Rebuild + levantar (tras cambiar código)
docker compose up -d --build
```
