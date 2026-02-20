# credentialStatus en JSON-LD: No soportado por Credo-TS

## Problema encontrado

Al emitir una credencial JSON-LD con el campo `credentialStatus` (Bitstring StatusList), el **holder** falla al recibir la credencial con:

```
CredoError: Failed to validate credential, error = CredoError:
Verifying credential status for JSON-LD credentials is currently not supported
```

## Causa raíz

Credo-TS bloquea `credentialStatus` en credenciales JSON-LD en **ambos** lugares posibles:

### 1. En el body de la credencial

En `W3cJsonLdCredentialService.verifyCredential`:

```javascript
const verifyCredentialStatus = options.verifyCredentialStatus ?? true;
// ...
checkStatus: ({ credential }) => {
    if (verifyCredentialStatus && "credentialStatus" in credential)
        throw new CredoError("Verifying credential status for JSON-LD credentials is currently not supported");
    return { verified: true };
}
```

Si la VC tiene el campo `credentialStatus`, lanza error. Existe el parámetro `verifyCredentialStatus: false` para saltear la validación, pero...

### 2. processCredential no lo pasa

En `DidCommJsonLdCredentialFormatService.processCredential` (el método que se ejecuta automáticamente al recibir una credencial):

```javascript
const result = await w3cCredentialService.verifyCredential(agentContext, { credential });
```

Llama con `{ credential }` a secas, sin `verifyCredentialStatus: false`. No hay forma de inyectar esa opción desde afuera.

### 3. En las options tampoco

Según el RFC 0593 de Aries, `credentialStatus` debería ir en las `options`, no en el body. Pero Credo también lo bloquea ahí:

```javascript
const foundFields = ["challenge", "domain", "credentialStatus", "created"]
    .filter((field) => options[field] !== void 0);
if (foundFields.length > 0)
    throw new CredoError(`Some fields are not currently supported in credential options: ${foundFields.join(", ")}`);
```

## Qué soporta Credo para revocación

| Formato | Revocación | Estado |
|---------|-----------|--------|
| **AnonCreds** | Revocation Registry + deltas | Integrado, requiere ledger (Indy, cheqd, etc.) |
| **SD-JWT** | Token Status List | Paquete `@sd-jwt/jwt-status-list` existe, integración con Credo en desarrollo |
| **JSON-LD (W3C VC)** | `credentialStatus` / Bitstring StatusList | **No soportado** — sin timeline definido |

## Investigación realizada

- **Issue #1863** (GitHub): Revocación para AnonCreds es manual — hay que extraer metadatos y consultar el registro. Para JSON-LD no hay nada.
- **Issue #1688** (GitHub): Para notificar errores al holder, la recomendación es usar problem reports genéricos o timeouts.
- **RFC 0593** (Aries): Define que `credentialStatus` va en options, pero Credo no lo implementa.
- **cheqd docs**: Solo documentan revocación para AnonCreds y SD-JWT, no para JSON-LD.

## Solución adoptada: Opción 1 — Mapeo externo

Dado que Credo no permite `credentialStatus` en JSON-LD, la revocación se maneja **por fuera** de la credencial:

1. **La credencial se emite SIN `credentialStatus`** → Credo la procesa sin problemas
2. **El issuer mantiene un mapeo interno** `credentialId → { statusListId, statusListIndex }`
3. **El issuer retorna `statusListIndex`** en la response de `POST /offer-credential`
4. **Revocación**: el issuer usa el mapeo para revocar en el VDR
5. **Verificación**: el verifier consulta al VDR usando el mapeo del issuer
6. **Consulta del holder**: el holder consulta al VDR usando el mapeo

### Diferencia con el estándar W3C

| Aspecto | Estándar W3C | Nuestra implementación |
|---------|-------------|----------------------|
| Dónde está el status | Embebido en la VC (`credentialStatus`) | Mapeo externo en el issuer |
| Quién conoce el índice | Cualquiera que lea la VC | Solo el issuer y quien consulte su API |
| Verificación | Verifier lee la VC y consulta URL | Verifier consulta al VDR vía issuer/mapeo |
| Portabilidad | La VC es auto-contenida | La VC depende del issuer para info de revocación |

### Trade-offs

- **Ventaja**: Compatible con Credo-TS sin hacks ni monkey-patches
- **Ventaja**: La revocación funciona correctamente
- **Desventaja**: La VC no es auto-contenida respecto a revocación
- **Desventaja**: Si el issuer pierde el mapeo, no se puede revocar

### Cuándo migrar al estándar

Cuando Credo-TS soporte `credentialStatus` en JSON-LD (o se migre a SD-JWT/AnonCreds), se puede embeber el campo en la credencial y eliminar el mapeo externo.

## Opciones descartadas

**Opción 2 — Monkey-patch**: Modificar `DidCommJsonLdCredentialFormatService.processCredential` para pasar `verifyCredentialStatus: false`. Frágil, se rompe con updates de Credo.

**Opción 3 — Cambiar a JWT**: Usar W3C JWT en vez de JSON-LD. Implica cambiar todo el sistema de firma y verificación.

**Opción 4 — Cambiar a AnonCreds**: Soporte nativo de revocación, pero requiere un ledger y cambiar el formato completo de credenciales.

## Fecha

2026-02-19

## Referencias

- [Credo-TS source: W3cJsonLdCredentialService.mjs](holder-service/node_modules/@credo-ts/core/build/modules/vc/data-integrity/W3cJsonLdCredentialService.mjs)
- [Credo-TS source: DidCommJsonLdCredentialFormatService.mjs](holder-service/node_modules/@credo-ts/didcomm/build/modules/credentials/formats/jsonld/DidCommJsonLdCredentialFormatService.mjs)
- [GitHub Issue #1863 — AnonCreds revocation](https://github.com/openwallet-foundation/credo-ts/issues/1863)
- [Aries RFC 0593 — JSON-LD Credential Attachment](https://identity.foundation/aries-rfcs/latest/aip2/0593-json-ld-cred-attach/)
- [W3C Bitstring Status List](https://www.w3.org/TR/vc-bitstring-status-list/)
