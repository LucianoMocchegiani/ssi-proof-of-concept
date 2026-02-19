# Explicación Detallada de Campos de Credencial Verificable y Contextos JSON-LD

## Tabla de Contenidos

1. [Estructura de una Credencial Verificable](#estructura-de-una-credencial-verificable)
2. [Campos de la Credencial](#campos-de-la-credencial)
3. [Campos del Proof](#campos-del-proof)
4. [Contextos JSON-LD](#contextos-json-ld)
5. [Contextos Específicos](#contextos-específicos)
6. [Emisión de Credenciales](#emisión-de-credenciales)
7. [Verificación de Credenciales](#verificación-de-credenciales)

---

## Estructura de una Credencial Verificable

Una credencial verificable (Verifiable Credential) es un documento digital que contiene información sobre un sujeto y está firmado criptográficamente por un emisor. Sigue el estándar W3C Verifiable Credentials.

### Ejemplo Completo

```json
{
  "id": "b1bc0d65-62db-4f57-a57f-746ef6d45bed",
  "type": ["VerifiableCredential", "GenericCredential"],
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://schema.org/docs/jsonldcontext.jsonld",
    "https://w3id.org/security/bbs/v1"
  ],
  "issuer": {
    "id": "did:cadena:lacnet:EiDyZwR2T31tDTMvqvlnvgcb2haVkikJd46YhK8d2gJnUA",
    "name": "Ciudad de Buenos Aires"
  },
  "issuanceDate": "2026-01-20T11:45:36.882Z",
  "credentialSubject": {
    "id": "did:cadena:lacnet:EiBX57Gyb6oL-xYB9hfV0yp9s7uZJ0Nh99PvCqXU4wRelg",
    "type": "Person",
    "nombre": "Juan",
    "apellido": "Perez",
    "fecha_emision": "2025-09-08"
  },
  "proof": {
    "type": "BbsBlsSignature2020",
    "created": "2026-01-20T11:45:42Z",
    "proofPurpose": "assertionMethod",
    "proofValue": "hToOtVsH34RTl8/C4FUGWdtkgJYr8xLHwfyXARGsnj33UTnC8zQ6cM5rn7gf80zmYUHlKfzccE4m7waZyoLEkBLFiK2g54Q2i+CdtYBgDdkUDsoULSBMcH1MwGHwdjfXpldFNFrHFx/IAvLVniyeMQ==",
    "verificationMethod": "did:cadena:lacnet:EiDyZwR2T31tDTMvqvlnvgcb2haVkikJd46YhK8d2gJnUA#vc-bbsbls"
  }
}
```

---

## Campos de la Credencial

### 1. `id` (Identificador de la Credencial)

**Qué es**: Identificador único de la credencial.

**Formato**: 
- Puede ser un IRI absoluto: `"https://example.org/credentials/b1bc0d65-62db-4f57-a57f-746ef6d45bed"`
- O un UUID relativo: `"b1bc0d65-62db-4f57-a57f-746ef6d45bed"` (se normaliza a absoluto antes de procesar)

**Cómo se forma**:
- Generado por el emisor al crear la credencial
- Puede ser un UUID aleatorio o un identificador basado en algún esquema del emisor
- Debe ser único dentro del dominio del emisor

**Ejemplo**:
```json
"id": "b1bc0d65-62db-4f57-a57f-746ef6d45bed"
```

**Importante**: Si es relativo, debe normalizarse a un IRI absoluto antes de `jsonld.expand()` para evitar "Safe mode validation error".

---

### 2. `type` (Tipo de la Credencial)

**Qué es**: Array que especifica los tipos de la credencial.

**Formato**: Array de strings, donde cada string es un IRI o término definido en el contexto.

**Valores comunes**:
- `"VerifiableCredential"`: Tipo base (siempre presente)
- `"GenericCredential"`, `"Person"`, `"Diploma"`, etc.: Tipos específicos de la credencial

**Cómo se forma**:
- El primer elemento siempre es `"VerifiableCredential"` (definido en el contexto W3C)
- Los tipos adicionales son específicos del dominio de la aplicación
- Pueden estar definidos en contextos JSON-LD personalizados

**Ejemplo**:
```json
"type": ["VerifiableCredential", "GenericCredential"]
```

**En el contexto JSON-LD**:
- `VerifiableCredential` está definido en `https://www.w3.org/2018/credentials/v1`
- Los tipos adicionales pueden estar en contextos personalizados (ej: `schema.org`)

---

### 3. `@context` (Contextos JSON-LD)

**Qué es**: Array de URLs que apuntan a documentos JSON-LD que definen el vocabulario y las reglas de interpretación de la credencial.

**Formato**: Array de strings (URLs o IRIs)

**Para qué sirve**:
1. **Define el vocabulario**: Mapea términos cortos (como `"issuer"`) a IRIs completos (como `"https://www.w3.org/2018/credentials#issuer"`)
2. **Define tipos de datos**: Especifica qué campos son fechas, IRIs, objetos, etc.
3. **Permite expansión**: `jsonld.expand()` usa los contextos para expandir términos cortos a IRIs completos
4. **Permite canonicalización**: `jsonld.canonize()` usa los contextos para generar N-Quads consistentes

**Ejemplo**:
```json
"@context": [
  "https://www.w3.org/2018/credentials/v1",           // Contexto base W3C
  "https://schema.org/docs/jsonldcontext.jsonld",    // Contexto para tipos de datos
  "https://w3id.org/security/bbs/v1"                  // Contexto para firma BBS
]
```

**Cómo funcionan**:
1. Cuando `jsonld.expand()` procesa la credencial, descarga cada contexto desde su URL
2. Cada contexto define mapeos de términos a IRIs
3. Los términos se expanden usando estos mapeos
4. Ejemplo: `"issuer"` → `"https://www.w3.org/2018/credentials#issuer"`

**Quién los crea**:
- **W3C**: Crea contextos estándar como `https://www.w3.org/2018/credentials/v1`
- **Organizaciones**: Crean contextos personalizados (ej: Extrimian, Schema.org)
- **Comunidad**: Contextos comunitarios como `https://w3id.org/security/bbs/v1`

**Cómo se crean**:
1. Se define un documento JSON-LD con mapeos de términos a IRIs
2. Se publica en una URL accesible (HTTPS)
3. Se referencia en las credenciales usando `@context`

**Ver sección [Contextos JSON-LD](#contextos-json-ld) para más detalles**.

---

### 4. `issuer` (Emisor de la Credencial)

**Qué es**: Identifica quién emitió la credencial.

**Formato**: Puede ser:
- **String simple**: `"did:cadena:lacnet:EiDyZwR2T31tDTMvqvlnvgcb2haVkikJd46YhK8d2gJnUA"`
- **Objeto con propiedades adicionales**:
  ```json
  {
    "id": "did:cadena:lacnet:EiDyZwR2T31tDTMvqvlnvgcb2haVkikJd46YhK8d2gJnUA",
    "name": "Ciudad de Buenos Aires"
  }
  ```

**Cómo se forma**:
- El `id` es el DID (Decentralized Identifier) del emisor
- El DID se resuelve a un DID Document que contiene las claves públicas del emisor
- Las propiedades adicionales (como `name`) son opcionales y proporcionan información legible

**Ejemplo**:
```json
"issuer": {
  "id": "did:cadena:lacnet:EiDyZwR2T31tDTMvqvlnvgcb2haVkikJd46YhK8d2gJnUA",
  "name": "Ciudad de Buenos Aires"
}
```

**En el contexto JSON-LD**:
- `issuer` está definido en `https://www.w3.org/2018/credentials/v1`
- Se mapea a: `"https://www.w3.org/2018/credentials#issuer"`
- Tipo: `@id` (debe ser un IRI o DID)

---

### 5. `issuanceDate` (Fecha de Emisión)

**Qué es**: Fecha y hora en que la credencial fue emitida.

**Formato**: String en formato ISO 8601 (UTC)

**Ejemplo**:
```json
"issuanceDate": "2026-01-20T11:45:36.882Z"
```

**Cómo se forma**:
- Generado automáticamente por el emisor al crear la credencial
- Usa `new Date().toISOString()` en JavaScript/TypeScript
- Siempre en UTC (termina en `Z`)

**En el contexto JSON-LD**:
- `issuanceDate` está definido en `https://www.w3.org/2018/credentials/v1`
- Se mapea a: `"https://www.w3.org/2018/credentials#issuanceDate"`
- Tipo: `xsd:dateTime` (fecha y hora según XML Schema)

---

### 6. `credentialSubject` (Sujeto de la Credencial)

**Qué es**: Contiene la información sobre el sujeto (holder) de la credencial.

**Formato**: Objeto con propiedades arbitrarias

**Estructura típica**:
```json
"credentialSubject": {
  "id": "did:cadena:lacnet:EiBX57Gyb6oL-xYB9hfV0yp9s7uZJ0Nh99PvCqXU4wRelg",
  "type": "Person",
  "nombre": "Juan",
  "apellido": "Perez",
  "fecha_emision": "2025-09-08"
}
```

**Campos comunes**:
- `id`: DID del sujeto (holder)
- `type`: Tipo del sujeto (ej: `"Person"`, `"Organization"`)
- Campos personalizados: Cualquier propiedad adicional definida por el emisor

**Cómo se forma**:
- El `id` es el DID del holder (quien recibirá la credencial)
- Los campos personalizados provienen de los datos proporcionados al emisor
- Pueden estar definidos en contextos JSON-LD personalizados

**En el contexto JSON-LD**:
- `credentialSubject` está definido en `https://www.w3.org/2018/credentials/v1`
- Se mapea a: `"https://www.w3.org/2018/credentials#credentialSubject"`
- Tipo: `@id` (el objeto completo se trata como un recurso)

---

## Campos del Proof

El `proof` es un objeto que contiene la información criptográfica necesaria para verificar la firma de la credencial.

### 1. `type` (Tipo de Firma)

**Qué es**: Especifica el algoritmo de firma usado.

**Formato**: String que debe ser un IRI absoluto o término definido en el contexto.

**Valores comunes**:
- `"BbsBlsSignature2020"`: Firma BBS+ sobre curva BLS12-381
- `"Ed25519Signature2018"`: Firma Ed25519
- `"RsaSignature2018"`: Firma RSA

**Ejemplo**:
```json
"type": "BbsBlsSignature2020"
```

**Cómo se forma**:
- El emisor selecciona el tipo de firma al crear la credencial
- Debe expandirse a un IRI absoluto antes de `jsonld.expand()`
- Ejemplo: `"BbsBlsSignature2020"` → `"https://w3id.org/security#BbsBlsSignature2020"`

**En el contexto JSON-LD**:
- `BbsBlsSignature2020` está definido en `https://w3id.org/security/bbs/v1` o `https://extrimian.blob.core.windows.net/rskec/securityv1.jsonld#BbsBlsSignature2020`

---

### 2. `created` (Fecha de Creación del Proof)

**Qué es**: Fecha y hora en que se creó la firma.

**Formato**: String en formato ISO 8601 (UTC)

**Ejemplo**:
```json
"created": "2026-01-20T11:45:42Z"
```

**Cómo se forma**:
- Generado automáticamente al firmar la credencial
- Usa `new Date().toISOString()` en JavaScript/TypeScript
- Debe ser posterior o igual a `issuanceDate`

**En el contexto JSON-LD**:
- `created` está definido en `http://purl.org/dc/terms/created` (Dublin Core)
- Tipo: `xsd:dateTime`

**Importante**: Este campo SÍ se canonicaliza porque está definido en Dublin Core (contexto estándar).

---

### 3. `proofPurpose` (Propósito del Proof)

**Qué es**: Especifica para qué propósito se usa la firma.

**Valores comunes**:
- `"assertionMethod"`: La credencial fue firmada para ser usada como aserción
- `"authenticationMethod"`: La firma se usa para autenticación

**Ejemplo**:
```json
"proofPurpose": "assertionMethod"
```

**Cómo se forma**:
- El emisor especifica el propósito al firmar
- Para credenciales, generalmente es `"assertionMethod"`
- Para presentaciones, puede ser `"authenticationMethod"`

**En el contexto JSON-LD**:
- `proofPurpose` está definido en `https://w3id.org/security#proofPurpose`
- Tipo: `@vocab` (vocabulario controlado)
- Valores posibles: `assertionMethod`, `authenticationMethod`, etc.

**Importante**: Este campo NO se canonicaliza si solo está definido en contextos de Extrimian. Necesita el contexto BBS W3C (`https://w3id.org/security/bbs/v1`) para canonicalizarse.

---

### 4. `proofValue` (Valor de la Firma)

**Qué es**: La firma criptográfica en sí, codificada en base64url.

**Formato**: String base64url (sin padding `=`)

**Ejemplo**:
```json
"proofValue": "hToOtVsH34RTl8/C4FUGWdtkgJYr8xLHwfyXARGsnj33UTnC8zQ6cM5rn7gf80zmYUHlKfzccE4m7waZyoLEkBLFiK2g54Q2i+CdtYBgDdkUDsoULSBMcH1MwGHwdjfXpldFNFrHFx/IAvLVniyeMQ=="
```

**Cómo se forma**:
1. Se canonicaliza la credencial (sin el proof) a N-Quads
2. Se canonicaliza el proof a N-Quads
3. Se concatenan todos los N-Quads
4. Se calcula el hash (SHA-256)
5. Se firma el hash con la clave privada del emisor usando el algoritmo especificado en `type`
6. Se codifica la firma en base64url

**Para BBS+**:
- La firma es un punto en la curva BLS12-381
- Tamaño típico: 96 bytes (G1) o 112 bytes (G2)
- Codificado en base64url: ~128-150 caracteres

**En el contexto JSON-LD**:
- `proofValue` está definido en `https://w3id.org/security#proofValue`
- Tipo: String (no se canonicaliza como campo, pero su valor se usa en la verificación)

---

### 5. `verificationMethod` (Método de Verificación)

**Qué es**: Identifica la clave pública que se debe usar para verificar la firma.

**Formato**: String que es un IRI o referencia a un fragmento del DID Document del emisor.

**Ejemplo**:
```json
"verificationMethod": "did:cadena:lacnet:EiDyZwR2T31tDTMvqvlnvgcb2haVkikJd46YhK8d2gJnUA#vc-bbsbls"
```

**Cómo se forma**:
- Es el DID del emisor + un fragmento que identifica la clave específica
- El fragmento (`#vc-bbsbls`) apunta a una entrada en el DID Document del emisor
- El DID Document contiene la clave pública en formato JWK o Base58

**Cómo se resuelve**:
1. Se extrae el DID: `did:cadena:lacnet:EiDyZwR2T31tDTMvqvlnvgcb2haVkikJd46YhK8d2gJnUA`
2. Se resuelve el DID usando un resolver (ej: `/resolve/` endpoint)
3. Se obtiene el DID Document
4. Se busca el fragmento `#vc-bbsbls` en el DID Document
5. Se extrae la clave pública (formato JWK o Base58)
6. Se convierte a formato necesario para verificación (ej: Base58 para BBS+)

**En el contexto JSON-LD**:
- `verificationMethod` está definido en `https://w3id.org/security#verificationMethod`
- Tipo: `@id` (debe ser un IRI)

**Importante**: Este campo NO se canonicaliza si solo está definido en contextos de Extrimian. Necesita el contexto BBS W3C (`https://w3id.org/security/bbs/v1`) para canonicalizarse.

---

## Contextos JSON-LD

### ¿Qué son los Contextos JSON-LD?

Los contextos JSON-LD son documentos que definen:
1. **Vocabulario**: Mapean términos cortos (como `"issuer"`) a IRIs completos (como `"https://www.w3.org/2018/credentials#issuer"`)
2. **Tipos de datos**: Especifican qué campos son fechas, IRIs, objetos, etc.
3. **Reglas de expansión**: Definen cómo expandir términos a IRIs durante `jsonld.expand()`
4. **Reglas de canonicalización**: Definen qué campos se incluyen en los N-Quads durante `jsonld.canonize()`

### ¿Para qué sirven?

1. **Interoperabilidad**: Permiten que diferentes sistemas entiendan el mismo vocabulario
2. **Compresión**: Permiten usar términos cortos en lugar de IRIs largos
3. **Expansión**: `jsonld.expand()` usa los contextos para expandir términos a IRIs
4. **Canonicalización**: `jsonld.canonize()` usa los contextos para generar N-Quads consistentes

### ¿Cómo funcionan?

1. **Referencia en `@context`**:
   ```json
   "@context": ["https://www.w3.org/2018/credentials/v1"]
   ```

2. **Descarga del contexto**:
   - `jsonld.expand()` descarga el contexto desde la URL
   - El contexto es un documento JSON-LD con mapeos

3. **Expansión de términos**:
   - `"issuer"` → `"https://www.w3.org/2018/credentials#issuer"`
   - `"created"` → `"http://purl.org/dc/terms/created"`

4. **Canonicalización**:
   - Solo los campos definidos en el contexto se incluyen en los N-Quads
   - Si un campo no está definido, no se canonicaliza

### ¿Quién los crea?

1. **W3C**: Contextos estándar como `https://www.w3.org/2018/credentials/v1`
2. **Organizaciones**: Contextos personalizados (ej: Extrimian, Schema.org)
3. **Comunidad**: Contextos comunitarios como `https://w3id.org/security/bbs/v1`

### ¿Cómo se crean?

1. Se define un documento JSON-LD con mapeos:
   ```json
   {
     "@context": {
       "issuer": {
         "@id": "https://www.w3.org/2018/credentials#issuer",
         "@type": "@id"
       }
     }
   }
   ```

2. Se publica en una URL accesible (HTTPS)

3. Se referencia en las credenciales:
   ```json
   "@context": ["https://example.org/contexts/v1"]
   ```

---

## Contextos Específicos

### 1. `https://www.w3.org/2018/credentials/v1` (W3C Credentials)

**Qué es**: Contexto base estándar de W3C para credenciales verificables.

**Define**:
- `VerifiableCredential`, `VerifiablePresentation`
- `issuer`, `credentialSubject`, `issuanceDate`
- `proof`, `verifiableCredential`, `holder`

**Quién lo crea**: W3C (World Wide Web Consortium)

**Cómo se usa**:
- Siempre presente en credenciales verificables
- Define el vocabulario base

**Ejemplo de mapeo**:
```json
{
  "issuer": {
    "@id": "https://www.w3.org/2018/credentials#issuer",
    "@type": "@id"
  }
}
```

---

### 2. `https://w3id.org/security/v1` (W3C Security - Estándar)

**Qué es**: Contexto estándar de W3C para firmas digitales.

**Define**:
- `proof`, `proofValue`, `verificationMethod`
- `created`, `proofPurpose`
- Tipos de firma: `Ed25519Signature2018`, `RsaSignature2018`, etc.

**Quién lo crea**: W3C (comunidad de seguridad)

**Cómo se usa**:
- Define campos del proof
- Define tipos de firma estándar

**Diferencia con Extrimian**:
- Este contexto SÍ define `proofPurpose` y `verificationMethod` dentro de los tipos de firma
- Permite canonicalizar todos los campos del proof

**Ejemplo de mapeo**:
```json
{
  "Ed25519Signature2018": {
    "@id": "https://w3id.org/security#Ed25519Signature2018",
    "@context": {
      "proofPurpose": {
        "@id": "https://w3id.org/security#proofPurpose",
        "@type": "@vocab"
      },
      "verificationMethod": {
        "@id": "https://w3id.org/security#verificationMethod",
        "@type": "@id"
      }
    }
  }
}
```

---

### 3. `https://w3id.org/security/bbs/v1` (W3C Security BBS)

**Qué es**: Contexto específico de W3C para firmas BBS+.

**Define**:
- `BbsBlsSignature2020`, `BbsBlsSignatureProof2020`
- `proofPurpose`, `verificationMethod` dentro del contexto de `BbsBlsSignature2020`
- `Bls12381G1Key2020`, `Bls12381G2Key2020`

**Quién lo crea**: W3C (comunidad de seguridad, específico para BBS+)

**Cómo se usa**:
- Necesario para canonicalizar todos los campos del proof cuando se usa `BbsBlsSignature2020`
- Define `proofPurpose` y `verificationMethod` dentro del contexto de `BbsBlsSignature2020`

**Importante**: Este contexto es CRÍTICO para generar los 4 N-Quads del proof (created, type, proofPurpose, verificationMethod).

**Ejemplo de mapeo**:
```json
{
  "BbsBlsSignature2020": {
    "@id": "https://w3id.org/security#BbsBlsSignature2020",
    "@context": {
      "proofPurpose": {
        "@id": "https://w3id.org/security#proofPurpose",
        "@type": "@vocab"
      },
      "verificationMethod": {
        "@id": "https://w3id.org/security#verificationMethod",
        "@type": "@id"
      }
    }
  }
}
```

---

### 4. `https://extrimian.blob.core.windows.net/rskec/securityv1.jsonld` (Extrimian Security)

**Qué es**: Contexto personalizado de Extrimian para firmas digitales.

**Define**:
- `BbsBlsSignature2020` (pero NO define `proofPurpose` ni `verificationMethod` dentro de este tipo)
- `created` (usando Dublin Core)
- Campos genéricos de seguridad

**Quién lo crea**: Extrimian (organización)

**Cómo se usa**:
- Usado por el issuer de Extrimian
- Define `BbsBlsSignature2020` pero NO define `proofPurpose` ni `verificationMethod` dentro del contexto de `BbsBlsSignature2020`

**Problema**:
- Solo permite canonicalizar `created` (definido en Dublin Core)
- NO permite canonicalizar `proofPurpose` ni `verificationMethod` porque no están definidos dentro del contexto de `BbsBlsSignature2020`

**Solución**:
- Agregar `https://w3id.org/security/bbs/v1` al `@context` del proof antes de canonicalizar
- Esto permite canonicalizar todos los campos del proof

**Ejemplo de mapeo**:
```json
{
  "BbsBlsSignature2020": {
    "@id": "https://extrimian.blob.core.windows.net/rskec/securityv1.jsonld#BbsBlsSignature2020"
    // ⚠️ NO define proofPurpose ni verificationMethod aquí
  },
  "created": {
    "@id": "http://purl.org/dc/terms/created",
    "@type": "xsd:dateTime"
  }
}
```

---

### 5. `https://extrimian.blob.core.windows.net/rskec/credentialsv1.jsonld` (Extrimian Credentials)

**Qué es**: Contexto personalizado de Extrimian para credenciales.

**Define**:
- Extensiones específicas de Extrimian para credenciales
- Tipos de credencial personalizados

**Quién lo crea**: Extrimian

**Cómo se usa**:
- Usado por el issuer de Extrimian
- Define tipos y campos específicos de Extrimian

---

## Emisión de Credenciales

### Proceso Completo

1. **Creación de la Estructura Base**:
   ```typescript
   const credential = {
     "@context": [
       "https://www.w3.org/2018/credentials/v1",
       "https://schema.org/docs/jsonldcontext.jsonld",
       "https://w3id.org/security/bbs/v1"
     ],
     "id": generateCredentialId(), // UUID o IRI absoluto
     "type": ["VerifiableCredential", "GenericCredential"],
     "issuer": {
       "id": issuerDID,
       "name": "Ciudad de Buenos Aires"
     },
     "issuanceDate": new Date().toISOString(),
     "credentialSubject": {
       "id": holderDID,
       "type": "Person",
       // ... campos personalizados
     }
   };
   ```

2. **Canonicalización del Documento**:
   - Se remueve el `proof` (aún no existe)
   - Se expande usando `jsonld.expand()` con los contextos
   - Se canonicaliza a N-Quads usando `jsonld.canonize()`
   - Resultado: 10 N-Quads (del documento sin proof)

3. **Canonicalización del Proof**:
   ```typescript
   const proof = {
     "@context": [
       "https://w3id.org/security/bbs/v1"  // ✅ Contexto BBS W3C
     ],
     "type": "BbsBlsSignature2020",
     "created": new Date().toISOString(),
     "proofPurpose": "assertionMethod",
     "verificationMethod": `${issuerDID}#vc-bbsbls`
   };
   ```
   - Se canonicaliza el proof a N-Quads
   - Resultado: 4 N-Quads (created, type, proofPurpose, verificationMethod)

4. **Generación de verifyData**:
   - Se concatenan los 10 N-Quads del documento + 4 N-Quads del proof
   - Total: 14 N-Quads

5. **Firma Criptográfica**:
   - Se calcula el hash SHA-256 de los 14 N-Quads
   - Se firma el hash con la clave privada del emisor usando BBS+
   - Se codifica la firma en base64url

6. **Agregar proofValue**:
   ```typescript
   credential.proof = {
     ...proof,
     "proofValue": signatureBase64url
   };
   ```

7. **Credencial Completa**:
   - La credencial ahora tiene el `proof` con `proofValue`
   - Está lista para ser emitida al holder

---

## Verificación de Credenciales

### Proceso Completo

1. **Recepción de la Credencial**:
   - El verificador recibe la credencial (puede venir dentro de una Verifiable Presentation)

2. **Normalización**:
   - Se normalizan IDs relativos a absolutos (si es necesario)
   - Se remueven campos problemáticos del proof (`challenge`, `proofPurpose`) antes de expansión
   - Se expande `proof.type` a IRI absoluto

3. **Agregar Contexto BBS W3C al Proof** (si falta):
   ```typescript
   if (!proof['@context']?.includes('https://w3id.org/security/bbs/v1')) {
     proof['@context'] = [
       ...(proof['@context'] || []),
       'https://w3id.org/security/bbs/v1'
     ];
   }
   ```

4. **Preservar verificationMethod**:
   - NO remover `verificationMethod` cuando se está canonicalizando un proof
   - Solo remover cuando se está expandiendo un documento completo

5. **Canonicalización del Documento**:
   - Se remueve el `proof` de la credencial
   - Se expande usando `jsonld.expand()` con los contextos
   - Se canonicaliza a N-Quads usando `jsonld.canonize()`
   - Resultado: 10 N-Quads (del documento sin proof)

6. **Canonicalización del Proof**:
   - Se canonicaliza el proof a N-Quads
   - Resultado: 4 N-Quads (created, type, proofPurpose, verificationMethod)

7. **Generación de verifyData**:
   - Se concatenan los 10 N-Quads del documento + 4 N-Quads del proof
   - Total: 14 N-Quads (debe coincidir exactamente con los del issuer)

8. **Resolución del DID del Emisor**:
   - Se extrae el DID del `verificationMethod`
   - Se resuelve el DID usando un resolver
   - Se obtiene el DID Document
   - Se extrae la clave pública del fragmento especificado

9. **Verificación Criptográfica**:
   - Se calcula el hash SHA-256 de los 14 N-Quads
   - Se decodifica `proofValue` de base64url
   - Se verifica la firma usando la clave pública del emisor
   - Resultado: `verified: true` si la firma es válida

10. **Validaciones Adicionales**:
    - Verificar que `proofPurpose` sea `"assertionMethod"`
    - Verificar que `created` sea posterior o igual a `issuanceDate`
    - Verificar que la credencial no haya expirado (si tiene `expirationDate`)

---

## Resumen de Campos y Contextos

| Campo | Tipo | Contexto | Se Canonicaliza | Notas |
|-------|------|----------|-----------------|-------|
| `id` | `@id` | W3C Credentials | Sí | Debe ser IRI absoluto o normalizarse |
| `type` | `@type` | W3C Credentials | Sí | Array de tipos |
| `@context` | Array | - | No | Define vocabulario |
| `issuer` | `@id` | W3C Credentials | Sí | DID del emisor |
| `issuanceDate` | `xsd:dateTime` | W3C Credentials | Sí | Fecha de emisión |
| `credentialSubject` | `@id` | W3C Credentials | Sí | Información del sujeto |
| `proof.type` | `@type` | Security/BBS | Sí | Tipo de firma (debe ser IRI absoluto) |
| `proof.created` | `xsd:dateTime` | Dublin Core | Sí | Fecha de creación del proof |
| `proof.proofPurpose` | `@vocab` | Security/BBS | Sí* | Propósito (requiere contexto BBS W3C) |
| `proof.verificationMethod` | `@id` | Security/BBS | Sí* | Clave pública (requiere contexto BBS W3C) |
| `proof.proofValue` | String | Security | No | Firma criptográfica (no se canonicaliza) |

*Solo se canonicaliza si el proof tiene el contexto BBS W3C (`https://w3id.org/security/bbs/v1`)

---

## Problemas Comunes y Soluciones

### Problema 1: "Safe mode validation error" por ID relativo

**Causa**: El `id` de la credencial es relativo y no se puede expandir.

**Solución**: Normalizar el ID a un IRI absoluto antes de `jsonld.expand()`.

### Problema 2: "Safe mode validation error" por `challenge`

**Causa**: `challenge` no está definido en ningún contexto JSON-LD.

**Solución**: Remover `challenge` del proof antes de `jsonld.expand()`, validar después.

### Problema 3: Solo se canonicaliza `created` del proof (1 N-Quad en lugar de 4)

**Causa**: El proof no tiene el contexto BBS W3C que define `proofPurpose` y `verificationMethod`.

**Solución**: Agregar `https://w3id.org/security/bbs/v1` al `@context` del proof antes de canonicalizar.

### Problema 4: "Invalid signature"

**Causa**: Los N-Quads generados no coinciden exactamente con los del issuer.

**Solución**: 
- Asegurar que se generen exactamente 14 N-Quads (10 del documento + 4 del proof)
- Asegurar que el proof tenga el contexto BBS W3C
- Asegurar que `verificationMethod` no se remueva durante la canonicalización del proof

---

## Referencias

- [W3C Verifiable Credentials Data Model](https://www.w3.org/TR/vc-data-model/)
- [W3C JSON-LD 1.1](https://www.w3.org/TR/json-ld11/)
- [BBS+ Signatures](https://w3c-ccg.github.io/ldp-bbs2020/)
- [DID Core](https://www.w3.org/TR/did-core/)
