3# Arquitectura BBS+ para Credenciales (definicion)

Documento que define como implementar credenciales W3C con BbsBlsSignature2020 en el sistema Credo, eliminando Ed25519 del flujo de credenciales.

Referencia: `emision-verificacion.md` (sistema LACNet/did:cadena) describe el flujo criptografico BBS+; no prescribe donde almacenar claves. Este doc define la decision.

---

## 1. Decision: BBS en KMS (alineado con sistema LACNet)

El documento `emision-verificacion.md` del otro sistema (did:cadena:lacnet) usa BbsBlsSignature2020. En arquitecturas enterprise/blockchain es habitual centralizar todas las claves en un KMS. Para mantener coherencia, **las claves BLS deben estar en el KMS**.

### Claves Ed25519 (existentes)
- **Donde**: KMS
- **Uso**: DIDs, DIDComm (handshake, mensajes), conexion OOB
- **Estado**: Se mantienen. No tocar.

### Claves BLS (Bls12381G2) para credenciales
- **Donde**: **KMS** (nuevo tipo de clave)
- **Formato**: KeyPair Bls12381G2 (guardado como JWK o formato BBS en KMS)
- **Uso**: Solo firmar credenciales W3C con BbsBlsSignature2020

**Implicaciones**:
1. **KMS**: Añadir soporte para crear claves Bls12381G2 y para **firmar** con BBS. El algoritmo BBS es distinto a Ed25519: la libreria @mattrglobal/bbs-signatures produce un "message" que se firma. El KMS debe exponer un endpoint que reciba ese message (hash/prehash) y devuelva la firma BBS.
2. **Flujo de firma**: Issuer canonicaliza, genera el "verifyData" (hash de N-Quads), llama a KMS POST /sign-bbs con keyId y data -> KMS retorna proofValue.
3. **Persistencia**: Tabla `keys` en KMS con tipo Bls12381G2; columna para distinguir Ed25519 vs BLS.

**Alternativa rechazada**: Clave BBS local en issuer. Se rechaza para alinear con el modelo centralizado del sistema de referencia (emision-verificacion).

---

## 2. Estructura del DID Document del Issuer

El issuer tendra **dos verification methods**:

| Metodo | Curva | Uso | Origen |
|--------|-------|-----|--------|
| Ed25519 | Ed25519 | DIDComm, conexion, handshake | KMS (existente) |
| BLS | Bls12381G2 | Firmar credenciales | KMS (nueva key) |

Ejemplo de DID Document:

```json
{
  "id": "did:custom:uuid-issuer",
  "verificationMethod": [
    {
      "id": "did:custom:uuid-issuer#key-1",
      "type": "JsonWebKey2020",
      "controller": "did:custom:uuid-issuer",
      "publicKeyJwk": { "kty": "OKP", "crv": "Ed25519", "x": "..." }
    },
    {
      "id": "did:custom:uuid-issuer#vc-bbs",
      "type": "Bls12381G2Key2020",
      "controller": "did:custom:uuid-issuer",
      "publicKeyBase58": "..."
    }
  ],
  "assertionMethod": [
    "did:custom:uuid-issuer#key-1",
    "did:custom:uuid-issuer#vc-bbs"
  ],
  "authentication": ["did:custom:uuid-issuer#key-1"],
  "service": [...]
}
```

- `#key-1`: Ed25519 del KMS (para DIDComm)
- `#vc-bbs`: BLS del KMS para credenciales; el verifier usa este para verificar el proof

**Registro en vdr-service**: Al arrancar el issuer: (1) Crear DID con Ed25519; (2) Crear clave BLS en KMS (POST /keys con type Bls12381G2); (3) Obtener publicKey del KMS; (4) Añadir verification method #vc-bbs al DidDocument; (5) Actualizar DID en vdr-service.

---

## 3. Componentes a modificar

### Eliminar (flujo credenciales Ed25519)

| Componente | Accion |
|------------|--------|
| `@digitalbazaar/ed25519-signature-2020` | Desinstalar (issuer, verifier) |
| `@digitalbazaar/ed25519-verification-key-2020` | Desinstalar |
| Codigo de emision con Ed25519Signature2020 | Reemplazar por BbsBlsSignature2020 |
| Codigo de verificacion con Ed25519 | Reemplazar por BBS |

**Nota**: Sign/Verify Ed25519 en KMS se **mantienen** para DIDComm (handshake, mensajes).

### Añadir

| Componente | Donde |
|------------|-------|
| Claves Bls12381G2 en KMS | kms-service: createKey con type Bls12381G2 |
| Sign BBS en KMS | kms-service: POST /sign-bbs (keyId, data) -> signature |
| `@mattrglobal/jsonld-signatures-bbs` | issuer, verifier |
| `@mattrglobal/bbs-signatures` | kms-service (para firmar), verifier (para verificar) |
| Logica para añadir verification method BLS al DidDocument | issuer (al crear DID, tras crear clave BLS en KMS) |

---

## 4. Flujo de arranque del Issuer

1. Crear DID con Ed25519 (KMS) como hasta ahora.
2. Crear clave BLS en KMS: `POST /keys` con `type: Bls12381G2`. KMS retorna keyId y publicKey.
3. Obtener DidDocument actual (o construirlo).
4. Añadir verification method `#vc-bbs` con `publicKeyBase58` (de la clave BLS del KMS).
5. Registrar/actualizar DidDocument en vdr-service.

---

## 5. Flujo de emision (BBS)

1. Issuer recibe payload (credentialSubject, type, etc.).
2. Crea StatusList en vdr-service si no existe; asigna statusListIndex.
3. Construye credencial con @context incluyendo `https://w3id.org/security/bbs/v1`.
4. Canonicaliza documento + proof a N-Quads (segun emision-verificacion.md).
5. Genera verifyData (hash SHA-256 de N-Quads).
6. **Llama a KMS**: `POST /sign-bbs` con keyId (BLS del issuer) y data (verifyData). KMS retorna proofValue.
7. proof.verificationMethod = `{issuerDid}#vc-bbs`.
8. Retorna credencial firmada.

---

## 6. Flujo de verificacion (BBS)

1. Verifier recibe credencial.
2. Extrae proof.verificationMethod (ej. `did:custom:xxx#vc-bbs`).
3. Resuelve DID en vdr-service.
4. Busca verification method con id `#vc-bbs` en el documento.
5. Obtiene publicKeyBase58 (clave publica BLS) del DidDocument.
6. Verifica firma BBS con la libreria (clave publica; no usa KMS).
7. Comprueba credentialStatus (StatusList) si existe.
8. Retorna `{ valid, revoked? }`.

---

## 7. vdr-service: actualizacion de DID

Hoy vdr-service solo tiene POST /did (insert/replace). Si el DidDocument se registra con id = did, un segundo POST con el mismo id reemplaza el documento. Entonces el issuer puede:

- Primero: POST /did con DidDocument solo Ed25519 (como hoy).
- Luego: POST /did de nuevo con DidDocument que incluye Ed25519 + BLS.

O implementar PUT /did/:id para actualizar sin reemplazar completamente.

---

## 8. Resumen de decisiones

| Aspecto | Decision |
|---------|----------|
| Clave BBS | **KMS** (alineado con emision-verificacion / sistema LACNet) |
| Clave Ed25519 | KMS (sin cambios) |
| DID Document | Dos verification methods: Ed25519 + BLS (#vc-bbs) |
| Proof type credenciales | BbsBlsSignature2020 |
| Proof type DIDComm | Ed25519 (sin cambios) |
| StatusList | Sin cambios (vdr-service) |
| KMS | Extender: createKey Bls12381G2, POST /sign-bbs |
| Eliminar | Ed25519 del flujo de credenciales; paquetes @digitalbazaar/ed25519-* |

---

## 9. Dependencias npm

**issuer / verifier:**
```json
{
  "@digitalbazaar/vc": "^4.x",
  "@mattrglobal/jsonld-signatures-bbs": "^0.12.x"
}
```

**kms-service** (para sign-bbs):
```json
{
  "@mattrglobal/bbs-signatures": "^0.12.x",
  "@mattrglobal/bls12381-key-pair": "^0.2.x"
}
```

Verificar versiones compatibles entre estos paquetes.

---

## 10. Orden de implementacion sugerido

1. **KMS**: Añadir createKey para Bls12381G2, persistir en tabla keys (distinguir tipo).
2. **KMS**: Implementar POST /sign-bbs (recibe keyId, data; retorna proofValue en base64url).
3. Añadir dependencias BBS en issuer, verifier y kms-service.
4. Eliminar @digitalbazaar/ed25519-* de issuer y verifier.
5. Issuer: al crear DID, crear clave BLS en KMS y añadir #vc-bbs al DidDocument.
6. Issuer: flujo de emision que llama a KMS /sign-bbs en lugar de firmar localmente.
7. Verifier: reemplazar verificacion por BBS (usa clave publica del DidDocument; no KMS).
8. Actualizar action plan CREDO-010 con esta arquitectura.
