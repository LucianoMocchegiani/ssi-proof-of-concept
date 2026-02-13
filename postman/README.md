# Colecciones Postman - Credo

## Issuer ↔ Holder - Conexión DIDComm

**Archivo:** `Issuer-Holder-Connection.postman_collection.json`

### Cómo usar

1. **Importar** la colección en Postman (File → Import).
2. Asegurarse de que Issuer y Holder están corriendo:
   - Issuer: `http://localhost:3000`
   - Holder: `http://localhost:9005`
3. Ejecutar los requests **en orden**:
   - **1. Issuer - Crear invitación**: genera la URL de invitación. El script guarda automáticamente `invitation` en la variable `invitationUrl`.
   - **2. Holder - Recibir invitación**: usa `{{invitationUrl}}` del paso anterior. Si ejecutas la colección con "Run collection", la variable se pasa automáticamente.

### Variables de colección

| Variable      | Default              | Descripción                    |
|---------------|----------------------|--------------------------------|
| `issuer_base` | http://localhost:3000 | Base URL del Issuer            |
| `holder_base` | http://localhost:9005 | Base URL del Holder            |
| `invitationUrl` | ( vacío )          | Se rellena tras el paso 1      |

### Con Docker

Si usas `docker compose`, los puertos están mapeados igual:

- Issuer API: 3000
- Holder API: 9005

No hace falta cambiar las variables por defecto.
