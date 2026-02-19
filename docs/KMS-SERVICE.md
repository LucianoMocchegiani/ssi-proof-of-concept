# KMS (Key Management Service)

## ¿Qué es?

El **KMS-service** es el **motor criptográfico** del sistema. Gestiona todo el ciclo de vida de las claves y ejecuta operaciones criptográficas. Es agnóstico a Credo: expone una API HTTP genérica que cualquier consumidor puede usar.

En este diseño, el KMS **reemplaza la parte de billetera/criptografía de Askar** cuando Credo necesita crear claves, firmar o cifrar.

---

## Responsabilidades

| Operacion | Implementado | Descripcion |
|-----------|---------------|-------------|
| **Crear claves** | Si (solo Ed25519) | Genera pares Ed25519, persiste en SQLite |
| **Almacenar claves** | Si | Persiste publicJwk y privateJwk en tabla `keys` |
| **Obtener clave publica** | Si | GET /keys/:id retorna JWK publico |
| **Firmar** | Si (Ed25519) | POST /sign con keyId y data (base64). Retorna signature (base64) |
| **Verificar** | Si (Ed25519) | POST /verify con keyId, data, signature. Retorna { valid } |
| **Cifrar** | Si | encrypt() soporta ChaCha20-Poly1305 (simétrico) y X25519 key agreement (anoncrypt/authcrypt) |
| **Descifrar** | Si | decrypt() soporta ChaCha20-Poly1305 y X25519 key agreement |
| **Random bytes** | Si | POST /random; Credo usa crypto local, no llama al KMS |
| **Importar clave** | Si | POST /keys/import con privateJwk |
| **Borrar clave** | Si | DELETE /keys/:id |

---

## ¿Qué NO hace el KMS?

- **No almacena** conexiones, DIDs, credenciales ni metadata de agentes → eso es del Storage
- **No resuelve DIDs** → eso lo hace el DID Resolver (que usa Storage)
- **No decide** qué firmar ni cuándo → solo ejecuta las operaciones que le piden

---

## Tipos de claves (implementacion actual)

| Tipo | Implementado | Uso en nuestro sistema |
|------|--------------|------------------------|
| **Ed25519** | Si | createKey() genera solo Ed25519. Uso: claves de DID (did:custom), DidDocument |
| **Otros (X25519, EC, etc.)** | No | El KMS ignora `type` en POST /keys y siempre crea Ed25519 |
| **Importar JWK** | Si | importKey() acepta cualquier privateJwk |

Para DIDComm, Credo puede usar claves propias o del KMS segun el flujo. Nuestro createKey solo produce Ed25519.

---

## Como se usan las claves en el sistema

> **Nota**: Las siguientes secciones describen los distintos tipos de claves y sus usos. Nuestra implementación soporta Ed25519 (firma/verificación) y X25519 (key agreement para cifrado DIDComm).

### 1. Claves del DID (Ed25519)

Definen la **identidad** del agente y permiten comunicarse de forma segura.

| Uso | Qué pasa |
|-----|----------|
| **Firmar** (Ed25519) | El issuer firma credenciales y Connection Response con su clave privada. El receptor verifica la firma usando la clave pública del issuer, obtenida al resolver su didDocument. |
| **Cifrar/descifrar** (X25519) | En DIDComm los mensajes van cifrados. Con la clave pública del otro cifras; con tu clave privada descifras lo que te envían. |
| **Autenticación** | "Soy el holder del DID X" se demuestra firmando un challenge con la clave privada. |

**Importancia**: Sin estas claves no hay identidad verificable ni comunicación segura. Son el núcleo del sistema.

> Ver [Firma y verificación criptográfica](informacion-detallada/firma-y-verificacion-criptografica.md) para el proceso detallado de firmar con clave privada y verificar con clave pública.
> Ver [Cifrado y descifrado criptográfico](informacion-detallada/cifrado-y-descifrado-criptografico.md) para el proceso de cifrar con clave pública del destinatario y descifrar con clave privada.
> Ver [Autenticación por firma DID](informacion-detallada/autenticacion-por-firma-did.md) para el proceso de demostrar control de un DID firmando un challenge.

### 2. Claves efímeras

Se crean para **una operación puntual** y luego se borran.

| Uso | Qué pasa |
|-----|----------|
| **Cifrado JARM** (OpenID4VC) | El verifier genera una clave temporal en el KMS, cifra la respuesta JARM (metadata del authorization server) con la clave pública del cliente y la borra. El holder descifra con su clave privada. Solo quien posee el par de claves correspondiente puede leer la respuesta. |
| **Acuerdo de claves** | En flujos ECDH o DIDComm se crea una clave efímera para derivar una clave compartida, se usa una sola vez y se elimina del KMS. Minimiza la superficie de ataque: si el servidor cae, esa sesión ya expiró. |

**Importancia**: Minimizan el daño si el servidor se compromete. Una clave efímera comprometida solo afecta esa operación concreta; las claves de identidad (DID) siguen intactas.

> Ver [Cifrado y descifrado criptográfico](informacion-detallada/cifrado-y-descifrado-criptografico.md) para el proceso de cifrar con clave pública del destinatario y descifrar con clave privada.

### 3. Claves de firma JWT

Para **credenciales JWT** y **tokens** en OpenID4VC.

| Uso | Qué pasa |
|-----|----------|
| **Credencial JWT** | El issuer firma el JWT de la credencial con su clave privada (ES256/ES384/ES512). El verifier obtiene la clave pública del issuer (por JWK en el didDocument o jwks_uri), comprueba la firma y valida que el contenido no fue alterado. |
| **Tokens** | El authorization server firma access y refresh tokens con su clave privada. Los clientes y resource servers verifican la firma usando la clave pública expuesta en jwks_uri. Si la firma no cuadra, el token se rechaza. |

**Importancia**: Garantizan que la credencial o el token provienen del issuer legítimo y no fueron alterados.

> Ver [Firma y verificación criptográfica](informacion-detallada/firma-y-verificacion-criptografica.md) para el proceso detallado de firmar con clave privada y verificar con clave pública.

### 4. Claves X.509

Para **certificados** en flujos empresariales.

| Uso | Qué pasa |
|-----|----------|
| **mTLS** | En conexión TLS mutua, cada parte presenta su certificado X.509. La clave privada asociada demuestra que controlas ese certificado. El peer valida la cadena hasta un CA de confianza. Sin la clave privada, no puedes autenticarte. |
| **Wallet attestation** | La wallet genera un attestation object (por ejemplo en Android con Key attestation) que incluye un certificado firmado por el fabricante/Google. Prueba que las claves viven en un TEE o Secure Enclave, no en software genérico. |

**Importancia**: Permiten integración con infraestructura PKI y cumplimiento normativo.

> Ver [Recursos criptografía y curvas elípticas](informacion-detallada/recursos-criptografia-curvas-elipticas.md) para contexto sobre curvas y firmas.

### 5. Claves de cifrado (JWE)

Para **cifrar contenido**.

| Uso | Qué pasa |
|-----|----------|
| **JWE en OpenID4VC** | El verifier o authorization server cifra la respuesta (authorization code, tokens) en JWE usando la clave pública del holder (obtenida vía jwk en la solicitud o cn_jwk). Solo quien tiene la clave privada correspondiente puede descifrar y usar el código o token. |
| **DIDComm** | Cifrado asimétrico (X25519) para envío seguro de mensajes. El emisor cifra con la clave pública del destinatario; el receptor descifra con su clave privada. Los mensajes en tránsito son ilegibles para terceros. |

**Importancia**: Evitan que respuestas sensibles sean interceptadas por terceros.

> Ver [Cifrado y descifrado criptográfico](informacion-detallada/cifrado-y-descifrado-criptografico.md) para el proceso de cifrar con clave pública del destinatario y descifrar con clave privada.

### Resumen

Las claves permiten que el sistema sea **confidencial** (solo el destinatario lee), **íntegro** (no se altera sin detectarlo) y **verificable** (sabes quién firmó qué).

---

## Uso en Credo

| Necesidad de Credo | Nuestro KMS | Nota |
|--------------------|-------------|------|
| **Crear DID** (createKey) | Si | CustomDidRegistrar llama kms.createKey() -> Ed25519 |
| **Obtener clave publica** (getPublicKey) | Si | Para DidRecord, resolver, etc. |
| **Firmar** | Si | sign() delega a kms-service vía POST /sign (Ed25519) |
| **Verificar** | Si | verify() usa publicJwk local o delega a kms-service vía POST /verify |
| **Cifrar/descifrar** DIDComm | Si | ChaCha20-Poly1305 + X25519 key agreement (anoncrypt/authcrypt) |

El agente usa `InternalKeyManagementService` (KMS interno) o `ExternalKeyManagementService` (KMS externo) según la variable `KMS_MODE`. Ambos soportan todas las operaciones necesarias para el flujo completo: createKey, getPublicKey, sign, verify, encrypt y decrypt. La verificación con `publicJwk` (sin keyId) se hace localmente con `crypto.verify` de Node.js. `randomBytes` también se ejecuta localmente en ambos modos.

---

## API REST (endpoints)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/keys` | Crear clave Ed25519. Body: `{ keyId?: string }`. Ignora `type` si Credo lo envia. |
| GET | `/keys/:id` | Obtener clave publica (JWK). 404 si no existe. |
| POST | `/keys/import` | Importar clave privada. Body: `{ privateJwk }` |
| DELETE | `/keys/:id` | Borrar clave |
| POST | `/random` | Bytes aleatorios. Body: `{ length?: number }`. Retorna `{ random: "base64..." }` |
| POST | `/sign` | Firmar con Ed25519. Body: `{ keyId, data (base64) }`. Retorna `{ signature (base64) }` |
| POST | `/verify` | Verificar firma Ed25519. Body: `{ keyId, data, signature }`. Retorna `{ valid }` |
| POST | `/encrypt` | Cifrar. Body: `{ key, encryption?, data (base64) }`. Soporta ChaCha20-Poly1305 y X25519 key agreement. |
| POST | `/decrypt` | Descifrar. Body: `{ key, encryption?, encrypted (base64), iv?, tag? }`. |

---

## Persistencia

- **POC**: SQLite en `./data/kms.sqlite`
- **Tabla `keys`**: `id`, `publicJwk`, `privateJwk`
- **Producción**: HSM, Cloud KMS (AWS KMS, Azure Key Vault), o almacén cifrado con master key

---

## Almacenamiento con multiples agentes

### Modo externo (`KMS_MODE: "external"`)

Con 3 agentes (issuer, holder, verifier) todos usan el **mismo KMS** y la **misma base SQLite**:

```
kms.sqlite
  |
  +-- tabla: keys
        | id (PRIMARY KEY)  | publicJwk  | privateJwk  |
        |-------------------|-------------|--------------|
        | uuid-issuer-1      | {...}       | {...}        |
        | uuid-holder-1     | {...}       | {...}        |
        | uuid-verifier-1   | {...}       | {...}        |
        | ...               | ...         | ...          |
```

**No hay separacion por agente**: todas las claves van a la misma tabla. Se distinguen solo por `id` (keyId). Credo genera un UUID unico por cada `createKey()`, asi que no hay colision entre agentes.

**Flujo**:
- Issuer llama `createKey()` al crear su DID -> KMS inserta fila con keyId nuevo
- Holder llama `createKey()` al crear su DID -> KMS inserta otra fila
- Verifier igual

Si se quisiera separacion explícita (por wallet/agente), habria que añadir columna `wallet_id` a la tabla o usar instancias separadas de KMS por agente.

### Modo interno (`KMS_MODE: "internal"`)

Cada agente tiene su **propio SQLite** aislado:

```
issuer-service/data/internal-kms.sqlite   → claves del issuer
holder-service/data/internal-kms.sqlite   → claves del holder
verifier-service/data/internal-kms.sqlite → claves del verifier
```

No hay base compartida. Las claves privadas nunca salen del proceso del agente.

---

## Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `KMS_SERVICE_PORT` | 4001 | Puerto HTTP (usado en main.ts) |
| `KMS_SQLITE_PATH` | `./data/kms.sqlite` | Ruta del archivo SQLite |

---

## Seguridad en produccion

1. **Claves privadas cifradas en reposo** con una master key o HSM
2. **TLS** obligatorio entre consumidores y KMS
3. **Autenticacion** (API key, mTLS, JWT) para acceder al KMS
4. **Audit logs** de todas las operaciones
5. **Rate limiting** y control de acceso por clave/operacion
6. **HSM** para operaciones sensibles (claves nunca salen del HSM)

---

## Resumen: que funciona hoy en nuestro POC

| Funcionalidad | Estado |
|---------------|--------|
| Crear DID (kms.createKey) | OK - Ed25519 |
| Obtener clave publica | OK |
| Importar clave | OK |
| Borrar clave | OK |
| Random bytes (POST /random) | OK - KMS; Credo usa crypto local |
| Firmar | OK - Ed25519 |
| Verificar | OK - Ed25519 |
| Cifrar/descifrar DIDComm | OK - ChaCha20-Poly1305 + X25519 |

---

## Configuración: KMS interno vs externo

| Variable | Valor | Efecto |
|----------|-------|--------|
| `KMS_MODE: "internal"` | KMS interno | Cripto local (Node.js `crypto`) + SQLite local por agente. Las claves privadas nunca salen del proceso. Ideal para holders / wallets personales. |
| `KMS_MODE: "external"` | **Actual** | Delega cripto al kms-service vía HTTP. SQLite centralizado. Ideal para issuers y verifiers industriales (reemplazable por HSM/Cloud KMS en producción). |

**Variables adicionales:**

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `EXTERNAL_KMS_URL` | `http://localhost:4001` | URL del kms-service (solo modo externo) |
| `INTERNAL_KMS_SQLITE_PATH` | `/app/data/internal-kms.sqlite` | Ruta del SQLite local (solo modo interno) |

**Diferencia clave:**

| Aspecto | KMS interno | KMS externo |
|---------|-------------|-------------|
| Cripto | Local (Node.js `crypto`) | Delegada a kms-service |
| Persistencia | SQLite local por agente | SQLite centralizado en kms-service |
| Clave privada | Vive en el proceso del agente | Vive en el servicio externo |
| Escalabilidad | Un SQLite por instancia | Múltiples agentes comparten un KMS |
| Producción | Wallet móvil, TEE | HSM, AWS KMS, Azure Key Vault |

El flujo completo (OOB, DIDComm, conexiones, emisión de credenciales, presentación de proofs) funciona con ambos modos.
