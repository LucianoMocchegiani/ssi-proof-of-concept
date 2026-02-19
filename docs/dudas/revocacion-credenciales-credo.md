# Revocacion de credenciales: Credo, DID Web y Blockchain

Documento que resume como maneja Credo la revocacion, y las diferencias entre sistemas con did:web (HTTP) y blockchain. Con did:custom buscamos emular el patron de blockchain sin ledger.

---

## 1. Como maneja Credo la revocacion

### Formatos soportados por Credo

| Formato | Emision DIDComm | Verificacion | Revocacion en Credo |
|---------|-----------------|--------------|--------------------|
| **W3C VC** (JWT, LD-Proof) | No (solo OpenID4VC) | Si | credentialStatus es estandar W3C; Credo no implementa StatusList por defecto |
| **AnonCreds** | Si | Si | Integrado: Revocation Registry + deltas; requiere VDR (ledger o did:web) |
| **SD-JWT VC** | No | Si | Similar a W3C |

### W3C: credentialStatus

Credo acepta credenciales W3C con `credentialStatus`. Ese campo es opcional y apunta a donde se puede verificar el estado (activo, revocado, suspendido). Credo **no genera** ni **no gestiona** el StatusList por defecto: eso lo debe implementar el issuer (servir la lista, actualizarla al revocar) y el verifier (consultar la URL).

### AnonCreds: integrado

Para AnonCreds, la revocacion esta integrada en Credo. El flujo es:

1. Al crear Credential Definition, el issuer puede marcar `revocationSupported: true`
2. Se crea un **Revocation Registry Definition** y se publica en el VDR (ledger o registry)
3. Cada credencial recibe un indice en ese registro
4. Al revocar, el issuer publica una **delta** (actualizacion del estado) en el VDR
5. El verifier consulta el VDR para obtener el Revocation Registry y las deltas, y comprueba si el indice esta revocado

**Credo soporta**: Indy, Cheqd, Hedera (ledger). Y alternativas sin blockchain via did:web (ver abajo).

---

## 2. Sistema con DID Web (sin blockchain)

### W3C + StatusList2021 / Bitstring Status List

| Paso | Donde | Como |
|------|-------|------|
| Emision | Issuer | Incluye `credentialStatus` en la credencial apuntando a una URL |
| Almacenar lista | Issuer | Mantiene un bitstring (o StatusList Credential) en su servidor o storage |
| Revocar | Issuer | Actualiza el bit correspondiente en la lista |
| Verificar | Verifier | Hace GET a la URL, obtiene la lista, verifica el bit |

La credencial tiene algo como:

```json
"credentialStatus": {
  "id": "https://issuer.ejemplo.com/status/1#94567",
  "type": "BitstringStatusListEntry",
  "statusPurpose": "revocation",
  "statusListIndex": "94567",
  "statusListCredential": "https://issuer.ejemplo.com/status/1"
}
```

El verifier hace GET a `https://issuer.ejemplo.com/status/1`, obtiene la lista (bitstring comprimido), y comprueba si el bit 94567 es 1 (revocado) o 0 (activo).

**Ventajas**: Sin blockchain, funciona con HTTP. El issuer controla su lista.
**Desventajas**: El issuer debe estar disponible; si cae, no se puede verificar revocacion.

### AnonCreds con did:web (credo-ts-didweb-anoncreds)

El proyecto [2060-io/credo-ts-didweb-anoncreds](https://github.com/2060-io/credo-ts-didweb-anoncreds) y la especificacion [did-web-anoncreds-method](https://github.com/2060-io/did-web-anoncreds-method) permiten usar AnonCreds **sin blockchain**:

- **Schema, Credential Definition, Revocation Registry Definition**: se resuelven via did:web (HTTP GET al DID Document y endpoints asociados)
- **Revocation Status List**: el Revocation Registry Definition incluye metadata con `revocationStatusListEndpoint`
- El verifier hace GET a `{endpoint}/{timestamp}` para obtener la lista de revocacion activa en ese momento

Ejemplo de metadata en Revocation Registry Definition (did:web):

```json
{
  "resourceMetadata": {
    "revocationStatusListEndpoint": "https://mydomain/revStatus/5762v4VZxFMLB5n9X4Upr3gXaCKTa8PztDDCnroauSsR"
  }
}
```

El verifier consulta ese endpoint (por timestamp) y obtiene la Revocation Status List actual. Todo via HTTP.

---

## 3. Sistema con Blockchain (ledger)

### AnonCreds en Indy / Cheqd / Hedera

| Componente | Donde se guarda |
|------------|-----------------|
| Schema | Ledger (transaccion on-chain) |
| Credential Definition | Ledger |
| Revocation Registry Definition | Ledger |
| Revocation Registry Entry (deltas) | Ledger |

Flujo:

1. Issuer registra Revocation Registry Definition en el ledger
2. Cada credencial emitida tiene un `credRevId` (registry + indice)
3. Al revocar, issuer publica una transaccion con el delta en el ledger
4. Verifier lee del ledger (o de un nodo/VDR que expone los datos) y comprueba el estado

**Ventajas**: Descentralizado, inmutable, el issuer no puede borrar historico.
**Desventajas**: Coste, complejidad, dependencia de la red.

---

## 4. did:custom emulando blockchain

Vuestro sistema usa `did:custom` con vdr-service (HTTP) en lugar de un ledger. Eso emula:

- **DID Document**: en vdr-service (como en un ledger publico, pero servido por vosotros)
- **Schema / Credential Definition / Revocation Registry**: hoy no estan; si los añadierais, irian en vdr-service o un servicio similar

Para **revocacion** con did:custom, teneis dos caminos:

### Opcion A: W3C + StatusList2021

- Issuer emite credenciales W3C con `credentialStatus` apuntando a una URL
- Esa URL puede ser servida por un **status-service** o por el propio issuer
- El bitstring puede vivir en Storage (tabla `StatusList` o similar) y exponerse via API
- Verifier: GET a la URL, verifica el bit

No necesita did:custom para la revocacion; solo una URL accesible.

### Opcion B: AnonCreds + did:custom (estilo did:web)

- Extender vdr-service (o un servicio "registry") para que, al resolver un DID URL con `service=anoncreds` y `relativeRef`, devuelva Schema, Credential Definition, Revocation Registry Definition
- El Revocation Registry Definition llevaria `revocationStatusListEndpoint` apuntando a vuestro dominio
- Un endpoint (ej. `/revStatus/{registryId}?timestamp=...`) serviria la Revocation Status List
- La lista puede generarse desde Storage (tabla de revocaciones) o desde un archivo/datos del issuer

Esto replica el modelo de did:web AnonCreds pero con did:custom como identificador del issuer.

---

## 5. Resumen comparativo

| Aspecto | DID Web (HTTP) | Blockchain (Ledger) | did:custom (vosotros) |
|---------|----------------|---------------------|------------------------|
| Donde vive el DID Document | URL (did:web) | Ledger | vdr-service |
| Donde vive la revocacion (W3C) | URL del issuer / status-service | N/A (W3C no usa ledger) | status-service o issuer |
| Donde vive la revocacion (AnonCreds) | HTTP endpoint en metadata | Ledger | Registry + endpoint HTTP |
| Descentralizacion | Baja (issuer/verifier central) | Alta | Baja (controlais los servicios) |
| Sin blockchain | Si | No | Si |

---

## 6. Estado actual en vuestro POC

- No hay emision de credenciales implementada aun
- No hay revocacion implementada
- Credo en issuer/holder/verifier usa W3C y/o AnonCreds segun el flujo
- Para añadir revocacion:
  - **W3C**: implementar StatusList (bitstring en Storage o archivo, API que lo sirva, credentialStatus en emision)
  - **AnonCreds con did:custom**: registrar en vdr-service (o registry) los objetos AnonCreds y exponer Revocation Status List por HTTP

---

## Referencias

- [StatusList2021 / Bitstring Status List](https://www.w3.org/TR/vc-bitstring-status-list/)
- [did-web-anoncreds-method](https://github.com/2060-io/did-web-anoncreds-method) - AnonCreds sin blockchain
- [credo-ts-didweb-anoncreds](https://github.com/2060-io/credo-ts-didweb-anoncreds) - Registry did:web para Credo
- [AnonCreds Specification](https://anoncreds.github.io/anoncreds-spec/) - Revocation Registry
- [Credo Features](https://credo.js.org/guides/features) - Formatos soportados
