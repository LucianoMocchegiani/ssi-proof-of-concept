# Colecciones Postman - Credo

## Issuer ↔ Holder - Conexión y Credenciales

**Archivo:** `Issuer-Holder-Connection.postman_collection.json`

### Cómo usar

1. **Importar** la colección en Postman (File → Import).
2. Asegurarse de que Issuer y Holder están corriendo:
   - Issuer: `http://localhost:3000`
   - Holder: `http://localhost:9005`
3. Ejecutar los requests **en orden**:

#### Flujo de conexión
- **1. Issuer - Crear invitación**: genera la URL. Guarda `invitationUrl`.
- **2. Holder - Recibir invitación**: usa `{{invitationUrl}}`. Esperar unos segundos para que la conexión termine.

#### Flujo de credenciales
- **3a. Holder - Listar conexiones**: obtiene `connectionId` del **holder**. **Obligatorio antes de 4a.**
- **3b. Issuer - Listar conexiones**: obtiene `connectionId` y `holderDid` del **issuer**. **Obligatorio antes de 4b.**
- **4a. Holder - Proponer credencial**: requiere `connectionId` de 3a (no de 3b).
- **4b. Issuer - Ofertar credencial**: requiere `connectionId` y `holderDid` de 3b (no de 3a).

**Importante:** El `connectionId` del holder y del issuer son distintos. Usa 3a para 4a, 3b para 4b. Si la conexión no aparece, espera 5–10 s después del paso 2.
- **5. Holder - Listar credenciales**: verifica las credenciales recibidas en el wallet.

### Variables de colección

| Variable       | Default               | Descripción                          |
|----------------|-----------------------|--------------------------------------|
| `issuer_base`  | http://localhost:3000 | Base URL del Issuer                  |
| `holder_base`  | http://localhost:9005 | Base URL del Holder                  |
| `invitationUrl`| (vacío)               | Se rellena tras paso 1               |
| `connectionId` | (vacío)               | Se rellena en paso 3a o 3b           |
| `holderDid`    | (vacío)               | Se rellena en paso 3b (para offer)  |

### Con Docker

Si usas `docker compose`, los puertos están mapeados igual:

- Issuer API: 3000
- Holder API: 9005

No hace falta cambiar las variables por defecto.
