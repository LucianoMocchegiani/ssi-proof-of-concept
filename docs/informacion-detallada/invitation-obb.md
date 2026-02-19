# Invitación Out-of-Band (OOB)

## Formato general

Una invitación DIDComm se representa como una **URL**:

```
{domain}?oob={base64}
```

Ejemplo: `http://localhost:3000?oob=eyJAdHlwZSI6Imh0dHBzOi8vZGlkY29tbS5vcmcvb3V0LW9mLWJhbmQvMS4xL2ludml0YXRpb24iLCJzZXJ2aWNlcyI6WyJkaWQ6Y3VzdG9tOmFiYzEyMyJdLCJoYW5kc2hha2VfcHJvdG9jb2xzIjpbLi4uXX0`

---

## ¿Qué se codifica en base64?

El valor `oob` es el **JSON completo del mensaje de invitación** convertido a base64url. El JSON tiene esta estructura:

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `@type` | string | Sí | Tipo de mensaje: `https://didcomm.org/out-of-band/1.1/invitation` |
| `@id` | string | Sí | Identificador único de la invitación (UUID) |
| `services` | array | Sí | DIDs o servicios inline del inviter. Con DIDs: `["did:custom:uuid"]`. Sin DIDs: objetos con `recipientKeys`, `serviceEndpoint` |
| `handshake_protocols` | array | Sí* | Protocolos soportados: `["https://didcomm.org/didexchange/1.0", "https://didcomm.org/connections/1.0"]` |
| `label` | string | No | Nombre legible del issuer/verifier |
| `goal_code` | string | No | Código del objetivo (ej. `issue-vc`, `request-proof`) |
| `goal` | string | No | Descripción legible del objetivo |
| `accept` | array | No | Formatos de mensaje aceptados |
| `imageUrl` | string | No | URL de imagen/logo |
| `requests~attach` | array | No | Adjuntos (ej. offer de credencial embebida) |

\* Obligatorio si hay handshake; puede omitirse si solo se adjuntan mensajes (ej. credencial connectionless).

---

## Ejemplo de JSON antes de codificar

**Con DID (nuestro flujo actual):**
```json
{
  "@type": "https://didcomm.org/out-of-band/1.1/invitation",
  "@id": "69212a3a-d068-4f9d-a2dd-4741bca89af3",
  "services": ["did:custom:a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
  "handshake_protocols": [
    "https://didcomm.org/didexchange/1.0",
    "https://didcomm.org/connections/1.0"
  ],
  "label": "Issuer"
}
```

**Sin DID (inline, flujo anterior):**
```json
{
  "@type": "https://didcomm.org/out-of-band/1.1/invitation",
  "@id": "69212a3a-d068-4f9d-a2dd-4741bca89af3",
  "services": [{
    "id": "#inline-0",
    "type": "did-communication",
    "serviceEndpoint": "http://localhost:3000",
    "recipientKeys": ["did:key:z6MkqgkLrRyLg6bqk27djwbbaQWgaSYgFVCKq9YKxZbNkpVv"],
    "routingKeys": []
  }],
  "handshake_protocols": ["https://didcomm.org/connections/1.0"]
}
```

---

## ¿Por qué se usa base64?

1. **URL-safe**: El JSON tiene caracteres como `{`, `"`, espacios que no son válidos en una query string. Base64url produce solo caracteres seguros para URLs (`A-Za-z0-9_-`).

2. **Compatibilidad con deep links**: Las invitaciones se comparten como links (QR, SMS, email). Una URL corta y portable es más práctica que un JSON largo.

3. **Estándar Aries/Credo**: El RFC 0434 (Out-of-Band) define este formato. Es el mismo que usan Sovrin, Indy, Trinsic, etc., lo que permite interoperabilidad.

4. **Un solo payload**: Todo el mensaje va en un parámetro. El receptor decodifica y obtiene el objeto completo sin otra petición HTTP.

---

## ¿Por qué base64 y no cifrado?

La invitación **no es secreta**. Solo indica "conecta conmigo usando este DID/protocolo". Las claves y el endpoint se obtienen después (resolviendo el DID o leyendo el servicio inline). Codificar en base64 **no es seguridad**; es solo **codificación** para meter un JSON en una URL.

---

## Flujo resumido

1. **Emisor** crea el JSON de invitación (con `services` = DID o inline).
2. **Emisor** hace `JSON → base64url`.
3. **Emisor** devuelve `{domain}?oob={base64}`.
4. **Receptor** recibe la URL, extrae `oob`, hace `base64url → JSON`.
5. **Receptor** lee `services`. Si es DID → resuelve contra vdr-service. Si es inline → usa claves directamente.
6. **Receptor** inicia el handshake usando la info obtenida.
