# KMS (Key Management Service)

## ¿Qué es?

El **KMS-service** es el **motor criptográfico** del sistema. Gestiona todo el ciclo de vida de las claves y ejecuta operaciones criptográficas. Es agnóstico a Credo: expone una API HTTP genérica que cualquier consumidor puede usar.

En este diseño, el KMS **reemplaza la parte de billetera/criptografía de Askar** cuando Credo necesita crear claves, firmar o cifrar.

---

## Responsabilidades

| Operación | Descripción |
|-----------|-------------|
| **Crear claves** | Genera pares de claves (Ed25519, X25519, EC, etc.) |
| **Almacenar claves** | Persiste claves públicas y privadas (privadas cifradas en producción) |
| **Firmar** | Firma datos con una clave privada |
| **Verificar** | Verifica firmas con una clave pública |
| **Cifrar** | Cifra datos (simétrico o asimétrico) |
| **Descifrar** | Descifra datos |
| **Random bytes** | Genera bytes aleatorios (nonces, IVs, etc.) |
| **Importar/exportar** | Importa claves externas, exporta públicas |
| **Borrar** | Elimina claves de forma segura |

---

## ¿Qué NO hace el KMS?

- **No almacena** conexiones, DIDs, credenciales ni metadata de agentes → eso es del Storage
- **No resuelve DIDs** → eso lo hace el DID Resolver (que usa Storage)
- **No decide** qué firmar ni cuándo → solo ejecuta las operaciones que le piden

---

## Tipos de claves que maneja

| Tipo | Uso típico |
|------|-------------|
| **Ed25519** | Firmas (DID auth, JWS, credenciales) |
| **X25519** | Cifrado ECDH (DIDComm, acuerdos de clave) |
| **EC (P-256, P-384, P-521)** | Firmas ES256/ES384/ES512 |
| **secp256k1** | Blockchain (ECDSA) |
| **AES** | Cifrado simétrico, wrapping de claves |
| **HMAC** | MACs |

---

## Cómo se usan las claves en el sistema (y por qué importan)

### 1. Claves del DID (Ed25519, X25519, EC)

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

Cuando un agente (Issuer, Holder, Verifier) necesita:

1. **Crear un DID** → Credo pide a KMS crear una clave Ed25519
2. **Firmar una credencial** → Credo pide a KMS firmar con la clave del issuer
3. **Enviar mensaje DIDComm** → Credo pide a KMS cifrar para el `recipientKey`
4. **Verificar presentación** → Credo pide a KMS verificar la firma

El agente usa el adaptador `RemoteKeyManagementService`, que traduce las llamadas de Credo a HTTP hacia el KMS.

---

## API REST (endpoints)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/keys` | Crear clave (body: `{ keyId?: string }`) |
| GET | `/keys/:id` | Obtener clave pública (JWK) |
| POST | `/keys/import` | Importar clave privada (body: `{ privateJwk }`) |
| DELETE | `/keys/:id` | Borrar clave |
| POST | `/random` | Bytes aleatorios (body: `{ length?: number }`) |
| POST | `/encrypt` | Cifrar datos |
| POST | `/decrypt` | Descifrar datos (body: `{ encrypted }`) |

---

## Persistencia

- **POC**: SQLite en `./data/kms.sqlite`
- **Tabla `keys`**: `id`, `publicJwk`, `privateJwk`
- **Producción**: HSM, Cloud KMS (AWS KMS, Azure Key Vault), o almacén cifrado con master key

---

## Variables de entorno

| Variable | Default | Descripción |
|----------|---------|-------------|
| `PORT` | 4001 | Puerto HTTP |
| `KMS_SQLITE_PATH` | `./data/kms.sqlite` | Ruta del archivo SQLite |

---

## Seguridad en producción

1. **Claves privadas cifradas en reposo** con una master key o HSM
2. **TLS** obligatorio entre consumidores y KMS
3. **Autenticación** (API key, mTLS, JWT) para acceder al KMS
4. **Audit logs** de todas las operaciones
5. **Rate limiting** y control de acceso por clave/operación
6. **HSM** para operaciones sensibles (claves nunca salen del HSM)
