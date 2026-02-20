# KMS (Key Management Service)

## ¿Qué es?

El **KMS-service** es el **motor criptográfico** del sistema. Gestiona todo el ciclo de vida de las claves y ejecuta operaciones criptográficas. Es agnóstico a Credo: expone una API HTTP genérica que cualquier consumidor puede usar.

En este diseño, el KMS **reemplaza la parte de billetera/criptografía de Askar** cuando Credo necesita crear claves, firmar o cifrar.

---

## Responsabilidades

| Operacion | Implementado | Descripcion |
|-----------|---------------|-------------|
| **Crear claves** | Si (Ed25519, Bls12381G2) | Genera pares Ed25519 o Bls12381G2, persiste en SQLite |
| **Almacenar claves** | Si | Persiste publicJwk y privateJwk en tabla `keys` |
| **Obtener clave publica** | Si | GET /keys/:id retorna JWK publico. Resuelve por UUID, JWK thumbprint (RFC 7638) o fingerprint multibase (z6M/z6L) |
| **Firmar** | Si (Ed25519, BBS) | POST /sign con keyId y data (base64). POST /sign-bbs para BBS. Retorna signature (base64) |
| **Verificar** | Si (Ed25519) | POST /verify con keyId, data, signature. Retorna { valid } |
| **Cifrar** | Si | encrypt() soporta ChaCha20-Poly1305 con AAD (simétrico) y X25519 key agreement via nacl.box (anoncrypt/authcrypt) |
| **Descifrar** | Si | decrypt() soporta ChaCha20-Poly1305 con AAD y X25519 key agreement via nacl.box.open |
| **Random bytes** | Si | POST /random; Credo usa crypto local, no llama al KMS |
| **Importar clave** | Si | POST /keys/import con privateJwk |
| **Borrar clave** | Si | DELETE /keys/:id |

---

## ¿Qué NO hace el KMS?

- **No almacena** conexiones, DIDs, credenciales ni metadata de agentes → eso es del Wallet (ex-Storage)
- **No resuelve DIDs** → eso lo hace el DID Resolver (que usa Wallet)
- **No decide** qué firmar ni cuándo → solo ejecuta las operaciones que le piden

---

## Tipos de claves (implementacion actual)

| Tipo | Implementado | Uso en nuestro sistema |
|------|--------------|------------------------|
| **Ed25519** | Si | createKey() genera Ed25519. Uso: claves de DID (did:custom), DidDocument, DIDComm |
| **Bls12381G2** | Si (solo kms-service) | createKey(type: 'Bls12381G2'). Uso: firmas BBS para ZKP/selective disclosure |
| **X25519** | Derivado | No se crea directamente. Se deriva de Ed25519 via `ed2curve.convertSecretKey()` para key agreement DIDComm |
| **Otros (EC, etc.)** | No | No implementados |
| **Importar JWK** | Si | importKey() acepta cualquier privateJwk |

Para DIDComm, Credo puede usar claves propias o del KMS segun el flujo. Nuestro createKey produce Ed25519; la conversión a X25519 para key agreement se hace internamente al momento de cifrar/descifrar.

---

## Algoritmos criptográficos

Credo llama al KMS con algoritmos específicos para cada paso del flujo DIDComm v1:

| Paso | Algoritmo | Primitiva | Uso |
|------|-----------|-----------|-----|
| **Key agreement** | `ECDH-HSALSA20` | X25519 ECDH + nacl.box (XSalsa20-Poly1305) | Cifrar/descifrar claves de recipient y sender key |
| **Wrapping** | `XSALSA20-POLY1305` | nacl.box / nacl.box.open (24-byte nonce) | Envolver la CEK para cada recipient (authcrypt con sender key, anoncrypt con ephemeral key) |
| **Content encryption** | `C20P` | ChaCha20-Poly1305 (12-byte IV, 16-byte tag) | Cifrar/descifrar el contenido del mensaje DIDComm con AAD (protected header) |

### Flujo de cifrado DIDComm v1 (3 llamadas al KMS)

1. **Encrypt sender key** (anoncrypt): `nacl.box` con ephemeral key pair → `[ephemeralPub(32) | nonce(24) | boxed]`
2. **Encrypt CEK por recipient** (authcrypt): `nacl.box` con sender key → `{ encrypted, iv(nonce) }`
3. **Encrypt contenido** (simétrico): `chacha20-poly1305` con CEK, IV de 12 bytes, tag de 16 bytes, y AAD (el protected header del JWE)

### Flujo de descifrado DIDComm v1 (3 llamadas al KMS)

1. **Decrypt sender key** (anoncrypt): extrae `ephemeralPub + nonce + boxed`, `nacl.box.open` con recipient key
2. **Decrypt CEK** (authcrypt): `nacl.box.open` con sender pub + recipient key + IV(nonce)
3. **Decrypt contenido** (simétrico): `chacha20-poly1305` con CEK, IV, tag, y AAD

> **Importante**: El AAD (Additional Authenticated Data) en el paso de contenido es el protected header del JWE codificado como UTF-8. Sin AAD, la autenticación del tag falla.

---

## Como se usan las claves en el sistema

> **Nota**: Las siguientes secciones describen los distintos tipos de claves y sus usos. Nuestra implementación soporta Ed25519 (firma/verificación) y X25519 (key agreement para cifrado DIDComm).

### 1. Claves del DID (Ed25519)

Definen la **identidad** del agente y permiten comunicarse de forma segura.

| Uso | Qué pasa |
|-----|----------|
| **Firmar** (Ed25519) | El issuer firma credenciales y Connection Response con su clave privada. El receptor verifica la firma usando la clave pública del issuer, obtenida al resolver su didDocument. |
| **Cifrar/descifrar** (X25519) | En DIDComm los mensajes van cifrados. La clave Ed25519 se convierte a X25519 via `ed2curve` para key agreement. Con la clave pública del otro cifras; con tu clave privada descifras lo que te envían. |
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
| **Anoncrypt DIDComm** | Para cifrar la sender key en DIDComm v1 authcrypt, se genera un par X25519 efímero con `nacl.box.keyPair()`. La clave pública se incluye en el payload; la privada se descarta inmediatamente después del cifrado. |

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
| **Obtener clave publica** (getPublicKey) | Si | Para DidRecord, resolver, etc. Resuelve por UUID, thumbprint o fingerprint multibase |
| **Firmar** | Si | sign() delega a kms-service vía POST /sign (Ed25519) o firma localmente (interno) |
| **Verificar** | Si | verify() usa publicJwk local con `crypto.verify` de Node.js (ambos modos) o delega vía POST /verify (externo con keyId) |
| **Cifrar/descifrar** DIDComm | Si | ECDH-HSALSA20 + XSALSA20-POLY1305 (nacl.box) para key agreement; C20P/ChaCha20-Poly1305 con AAD para contenido |
| **Firma BBS** (solo externo) | Si | kms-service soporta Bls12381G2 y POST /sign-bbs para selective disclosure |

El agente usa `InternalKeyManagementService` (KMS interno) o `ExternalKeyManagementService` (KMS externo) según la variable `KMS_MODE`. Ambos soportan todas las operaciones necesarias para el flujo DIDComm completo: createKey, getPublicKey, sign, verify, encrypt y decrypt. La verificación con `publicJwk` (sin keyId) se hace localmente con `crypto.verify` de Node.js en ambos modos. `randomBytes` también se ejecuta localmente en ambos modos.

---

## Resolución de keyId (kms-service)

El `kms-service` (modo externo) implementa resolución flexible de keyId. Credo puede pasar diferentes formatos de identificador:

| Formato | Ejemplo | Resolución |
|---------|---------|------------|
| **UUID directo** | `a1b2c3d4-...` | Búsqueda directa por `id` en tabla `keys` |
| **JWK Thumbprint Ed25519** (RFC 7638) | `abc123...` (base64url SHA-256) | Calcula thumbprint de cada clave y compara |
| **JWK Thumbprint X25519** | `xyz789...` | Convierte Ed25519→X25519, calcula thumbprint y compara |
| **Fingerprint multibase Ed25519** | `z6Mk...` | Multicodec 0xed01 + base58btc |
| **Fingerprint multibase X25519** | `z6LS...` | Convierte Ed25519→X25519, multicodec 0xec01 + base58btc |
| **DID fragment** | `did:custom:abc#z6Mk...` | Extrae la parte después de `#` y resuelve |

El KMS interno no necesita esta resolución porque Credo siempre le pasa el `keyId` UUID directo (que es el mismo que se usó al crear la clave localmente).

---

## API REST (endpoints)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/keys` | Crear clave. Body: `{ keyId?: string, type?: { kty, crv } \| { keyType: 'Bls12381G2' } }`. Default: Ed25519. |
| GET | `/keys/:id` | Obtener clave publica (JWK o publicKeyBase58 para BLS). Resuelve por UUID, thumbprint o fingerprint. 404 si no existe. |
| POST | `/keys/import` | Importar clave privada. Body: `{ privateJwk }` |
| DELETE | `/keys/:id` | Borrar clave |
| POST | `/random` | Bytes aleatorios. Body: `{ length?: number }`. Retorna `{ random: "base64..." }` |
| POST | `/sign` | Firmar con Ed25519. Body: `{ keyId, data (base64) }`. Retorna `{ signature (base64) }` |
| POST | `/sign-bbs` | Firmar con BBS (Bls12381G2). Body: `{ keyId, data (base64) }`. Retorna `{ proofValue (base64url) }` |
| POST | `/verify` | Verificar firma Ed25519. Body: `{ keyId, data, signature }`. Retorna `{ valid }` |
| POST | `/encrypt` | Cifrar. Body: `{ key, encryption?, data (base64) }`. Soporta C20P con AAD y X25519 key agreement (nacl.box). |
| POST | `/decrypt` | Descifrar. Body: `{ key, encryption?, encrypted (base64), iv?, tag? }`. |

---

## Persistencia

### kms-service (modo externo)

- **POC**: SQLite en `./data/kms.sqlite`
- **Tabla `keys`**: `id`, `keyType`, `publicJwk`, `privateJwk`
- `keyType`: `'Ed25519'` o `'Bls12381G2'`
- **Producción**: HSM, Cloud KMS (AWS KMS, Azure Key Vault), o almacén cifrado con master key

### KMS interno (modo interno)

- **POC**: SQLite en `./data/internal-kms.sqlite` (por agente)
- **Tabla `keys`**: `id`, `publicJwk`, `privateJwk` (sin `keyType`, solo Ed25519)

---

## Almacenamiento con multiples agentes

### Modo externo (`KMS_MODE: "external"`)

Con 3 agentes (issuer, holder, verifier) todos usan el **mismo KMS** y la **misma base SQLite**:

```
kms.sqlite
  |
  +-- tabla: keys
        | id (PRIMARY KEY)  | keyType   | publicJwk  | privateJwk  |
        |-------------------|-----------|-------------|--------------|
        | uuid-issuer-1     | Ed25519   | {...}       | {...}        |
        | uuid-holder-1     | Ed25519   | {...}       | {...}        |
        | uuid-verifier-1   | Ed25519   | {...}       | {...}        |
        | uuid-bls-1        | Bls12381G2| {...}       | {...}        |
        | ...               | ...       | ...         | ...          |
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

## Dependencias

### kms-service (modo externo)

| Dependencia | Uso |
|-------------|-----|
| `tweetnacl` | nacl.box / nacl.box.open para X25519 key agreement (XSalsa20-Poly1305) |
| `ed2curve` | Conversión Ed25519 → X25519 (pares de claves) |
| `bs58` | Codificación base58 para fingerprints multibase |
| `@mattrglobal/bbs-signatures` | Firma BBS con claves Bls12381G2 |
| `sqlite3` (async) | Persistencia de claves |

### KMS interno (InternalKeyManagementService)

| Dependencia | Uso |
|-------------|-----|
| `tweetnacl` | nacl.box / nacl.box.open para X25519 key agreement |
| `ed2curve` | Conversión Ed25519 → X25519 |
| `better-sqlite3` | Persistencia local SQLite (síncrono, más rápido) |
| Node.js `crypto` | Ed25519 sign/verify, ChaCha20-Poly1305 simétrico, randomBytes |

---

## Variables de entorno

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `KMS_SERVICE_PORT` | 4001 | Puerto HTTP del kms-service (usado en main.ts) |
| `KMS_SQLITE_PATH` | `./data/kms.sqlite` | Ruta del archivo SQLite del kms-service |

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
| Crear clave BLS (kms.createKey) | OK - Bls12381G2 (solo kms-service) |
| Obtener clave publica | OK - con resolución por UUID, thumbprint, fingerprint |
| Importar clave | OK |
| Borrar clave | OK |
| Random bytes (POST /random) | OK - KMS; Credo usa crypto local |
| Firmar Ed25519 | OK |
| Firmar BBS | OK - (solo kms-service) |
| Verificar Ed25519 | OK |
| Cifrar DIDComm (key agreement) | OK - nacl.box (ECDH-HSALSA20 + XSALSA20-POLY1305) |
| Cifrar DIDComm (contenido) | OK - ChaCha20-Poly1305 (C20P) con AAD |
| Descifrar DIDComm (key agreement) | OK - nacl.box.open |
| Descifrar DIDComm (contenido) | OK - ChaCha20-Poly1305 (C20P) con AAD |
| Interoperabilidad internal ↔ external | OK - mismos algoritmos y formatos |

---

## Configuración: KMS interno vs externo

| Variable | Valor | Efecto |
|----------|-------|--------|
| `KMS_MODE: "internal"` | KMS interno | Cripto local (`tweetnacl` + `ed2curve` + Node.js `crypto`) + SQLite local por agente. Las claves privadas nunca salen del proceso. Ideal para holders / wallets personales. |
| `KMS_MODE: "external"` | **Actual** | Delega cripto al kms-service vía HTTP. SQLite centralizado. Ideal para issuers y verifiers industriales (reemplazable por HSM/Cloud KMS en producción). |

**Variables adicionales:**

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `EXTERNAL_KMS_URL` | `http://localhost:4001` | URL del kms-service (solo modo externo) |
| `INTERNAL_KMS_SQLITE_PATH` | `/app/data/internal-kms.sqlite` | Ruta del SQLite local (solo modo interno) |

**Diferencia clave:**

| Aspecto | KMS interno | KMS externo |
|---------|-------------|-------------|
| Cripto key agreement | Local (`tweetnacl` nacl.box + `ed2curve`) | Delegada a kms-service (mismas libs) |
| Cripto simétrica | Local (Node.js `crypto` chacha20-poly1305) | Delegada a kms-service |
| Firma/verificación | Local (Node.js `crypto` Ed25519) | Delegada a kms-service |
| Persistencia | SQLite local por agente (`better-sqlite3`) | SQLite centralizado en kms-service |
| Clave privada | Vive en el proceso del agente | Vive en el servicio externo |
| Resolución keyId | Solo UUID directo | UUID, thumbprint, fingerprint multibase |
| BLS/BBS | No soportado | Soportado (Bls12381G2) |
| Escalabilidad | Un SQLite por instancia | Múltiples agentes comparten un KMS |
| Producción | Wallet móvil, TEE | HSM, AWS KMS, Azure Key Vault |

El flujo completo (OOB, DIDComm, conexiones, emisión de credenciales, presentación de proofs) funciona con ambos modos y son **interoperables** entre sí (un agente en modo interno puede comunicarse con uno en modo externo).
