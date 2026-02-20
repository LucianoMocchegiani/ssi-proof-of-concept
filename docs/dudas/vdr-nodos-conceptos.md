# VDR, Nodos y Conceptos Relacionados

Documento de referencia sobre Verifiable Data Registries (VDR), la distinción entre VDR y Node, did:web, y conceptos Indy (NYM, Schema, cred_def).

---

## 1. VDR vs Node – Diferencia Fundamental

| Concepto | Rol | ¿Quién lo corre? | Tamaño/Complejidad |
|---------|-----|------------------|---------------------|
| **Node** | Participa en el consenso y almacena el ledger. Procesa transacciones, mantiene la cadena. | Operadores de red, validators. | Pesado: varios GB, varios procesos. |
| **VDR** | "Dónde leo y escribo DIDs y datos verificables". Abstracción: lugar donde resolver y registrar. | Puede ser el ledger, una API HTTP, o un servicio propio. | Variable: ligero (API) o pesado (si incluye nodo). |

**VDR** = Verifiable Data Registry. Es el lugar donde se resuelven y registran DIDs, schemas, credential definitions, etc.

**Node** = La infraestructura que ejecuta el consenso y persiste la cadena. Normalmente no corres un nodo; usas APIs o resolvers que hablan con nodos operados por otros.

### Ejemplos

- **Indy**: El VDR es el ledger Indy. Accedes con **indy-vdr** (cliente ligero). No corres indy-node.
- **did:web**: El VDR es tu servidor web que sirve `did.json`. No hay nodo.
- **Cheqd**: El VDR es el ledger. Accedes vía resolver (hosteado o Docker) que habla con nodos por gRPC. No corres nodos.
- **Tu vdr-service**: Una capa que habla con RSK/IPFS y expone resolver + registro.

---

## 2. did:web – Cómo funciona

### ¿Dónde se guarda el DID?

```
did:web:example.com
  → https://example.com/.well-known/did.json

did:web:example.com:user:alice
  → https://example.com/user/alice/did.json
```

- El DID Document es un JSON servido por HTTPS.
- La resolución es un `GET` a esa URL.
- No hay blockchain ni ledger.

### ¿Dónde se guarda el estado de la credencial?

**did:web** solo define DIDs. No define dónde vive el estado/revocación de credenciales.

El **estado de la credencial** viene del modelo de **Verifiable Credentials** y el campo `credentialStatus`:

- Cada credencial puede tener un campo `credentialStatus` que apunta a una URL o recurso externo.
- Ese recurso puede estar en: un endpoint de tu dominio, IPFS, una blockchain (Indy, Cheqd), etc.

Ejemplo:

```json
{
  "credentialStatus": {
    "id": "https://issuer.com/status/cred-123#revocation",
    "type": "StatusList2021Entry",
    "statusListCredential": "https://issuer.com/status/list.json",
    "statusListIndex": "42"
  }
}
```

El estado vive en `https://issuer.com/status/`. did:web solo aporta el DID; el status es independiente.

---

## 3. NYM, Schema, cred_def – Conceptos Indy

Estos son **objetos del ledger Indy**, no de did:web ni de un VDR genérico.

| Concepto | ¿Qué es? | ¿Dónde vive? |
|----------|----------|--------------|
| **NYM** | Identidad / DID en Indy. Forma de anclar un DID en el ledger. | Ledger Indy |
| **Schema** | Estructura de la credencial: qué atributos tiene (nombre, fecha_nacimiento, etc.). Es un "template". | Ledger Indy |
| **cred_def** (Credential Definition) | "Este issuer emite credenciales de este schema": incluye claves públicas para firmar/ocultar atributos. | Ledger Indy |

Flujo típico en Indy:

1. Registrar **NYM** → creas el DID en el ledger.
2. Publicar **Schema** → defines la estructura.
3. Publicar **cred_def** → el issuer liga sus claves a ese schema.
4. Emitir credenciales según ese cred_def.

En **did:web** no existen NYM, schema ni cred_def. Todo se construye con DID en `did.json` y esquemas/claves fuera del método.

---

## 4. gRPC

**gRPC** = Protocolo de comunicación

- Creado por Google, basado en HTTP/2.
- Usa **Protocol Buffers** para serializar datos.
- El cliente llama procedimientos remotos como si fueran funciones locales.

En el contexto de VDRs:

- **Cosmos / Cheqd**: Los nodos exponen APIs por gRPC (puerto 9090).
- **Indy**: No usa gRPC principalmente; tiene su propio protocolo con ZMQ.
- **Hedera**: Ofrece tanto REST como gRPC.

Cuando un resolver se conecta a la red, puede hacerlo por gRPC si el ledger lo soporta.

---

## 5. Comparación: Indy, Hedera, Cheqd

| Aspecto | Indy | Hedera | Cheqd |
|---------|------|--------|-------|
| ¿Corrés nodo? | No (usás pools). Sí solo si operás la red. | No | No (salvo que seas validator) |
| Tamaño cliente | indy-vdr: ligero | APIs: ligero | Resolver: ligero |
| Resolver | indy-vdr-proxy o lib | APIs Hedera | resolver.cheqd.net o Docker |
| Registro DIDs | Via pool Indy | Via HCS topics | Via ledger Cosmos |
| Dependencias | Genesis + pool config | Ninguna (API) | gRPC a nodos |

---

## 6. Diagrama general

```
┌─────────────────────────────────────────────────────────────────────┐
│  TU APLICACIÓN                                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP / gRPC
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  VDR (Verifiable Data Registry)                                      │
│  "Dónde leo y escribo DIDs y datos verificables"                   │
│                                                                     │
│  Puede ser:                                                         │
│  • did:web → tu servidor (did.json)                                 │
│  • indy-vdr-proxy → cliente contra pool Indy                        │
│  • resolver.cheqd.net → API hosteada                                 │
│  • vdr-service propio → habla con RSK/IPFS u otro backend           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              │ (Si hay blockchain)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  NODE (solo si usás ledger distribuido)                              │
│  Participa en consenso, almacena ledger.                             │
│  Lo operan validators, no tu app.                                   │
└─────────────────────────────────────────────────────────────────────┘
```

Para **did:web** no hay nodo; el VDR es tu servidor web. Para **Indy/Cheqd/Hedera** hay nodos, pero tu app solo habla con el VDR (proxy, resolver, API), no corre nodos.
