# Propuesta: seguridad del storage del holder

Propuesta de diseño para un storage de holder que proteja credenciales, DIDs y claves frente a amenazas internas mediante cifrado cliente. Incluye el escenario de **recuperación** (dispositivo perdido, wallet borrada).

---

## Objetivo

Que los datos del holder (credenciales, DIDs, claves) permanezcan ilegibles para quien tenga acceso al storage (incluido personal interno), salvo el propio usuario. La clave de cifrado deriva de un secreto que solo conoce el usuario y nunca abandona su dispositivo.

---

## Alcance: ¿qué hay que proteger y recuperar?

No basta con proteger solo la credencial. Para **presentar** una credencial, el holder debe probar que controla el DID del `credentialSubject`. Sin la clave privada, la credencial recuperada no es usable.

| Dato | Por qué es necesario |
|------|------------------------|
| **Credencial** | Contenido a presentar (claims, firma del issuer) |
| **DID + clave privada** | Probar control del sujeto de la credencial al presentar |
| **Conexiones** *(opcional)* | Reutilizar conexiones existentes; no crítico para recuperación básica |

**Conclusión**: El backup de recuperación debe incluir credencial(es) **y** material de claves (o seed que los derive).

---

## Principio clave

**La clave de cifrado no debe estar nunca en el backend.**  
Si el servidor puede obtener la clave, cualquier persona con acceso al servidor también puede descifrar. La derivación de clave y el cifrado se realizan en el **cliente** (wallet, app, navegador).

---

## Flujo propuesto

### Almacenamiento / backup (primera vez o tras cambios)

```
1. Usuario recibe credencial y establece conexión (flujo DIDComm normal)
2. Usuario define PIN/contraseña en el cliente
3. Cliente deriva key = KDF(PIN, salt)
4. Cliente prepara payload de backup:
   - Credencial(es) (W3cCredentialRecord, etc.)
   - DidRecord(s) con keys (kmsKeyId → clave exportada del KMS local)
   - O bien: seed/mnemonic si el DID es derivable
5. Cliente cifra el payload con AES-GCM
6. Cliente envía al holder-service: { ciphertext, salt, metadata }
7. Holder-service guarda sin tener acceso a key ni PIN
```

### Recuperación (dispositivo perdido, wallet borrada)

```
8. Usuario ingresa PIN en el cliente (nuevo dispositivo)
9. Cliente deriva key = KDF(PIN, salt)
10. Cliente solicita ciphertext al holder-service (autenticado)
11. Cliente descifra localmente
12. Cliente restaura: credencial(es) + DidRecord(s)/keys en el KMS local
13. Usuario puede presentar de nuevo
```

El backend solo conoce y almacena ciphertext y salt; nunca maneja el PIN ni la clave derivada.

---

## Payload de backup: contenido

| Elemento | Descripción | Crítico para presentar |
|----------|-------------|-------------------------|
| **Credencial** | W3cCredentialRecord / AnonCredsCredentialRecord (claims, firma) | Sí |
| **DidRecord** | did, didDocument, keys (kmsKeyId + clave privada exportada) | Sí |
| **ConnectionRecord** *(opcional)* | Para reutilizar conexiones; puede regenerarse con nueva invitación | No |
| **CredentialExchangeRecord** *(opcional)* | Historial del flujo; no necesario para presentar | No |

El **mínimo recuperable**: credencial + DID + clave privada del subject.

---

## Opciones de diseño para keys

### Opción A: Backup de keys exportadas (cifradas)

- Al hacer backup, el cliente exporta las claves privadas del KMS local.
- Las incluye en el payload cifrado.
- Recuperación: descifrar y volver a importar en el KMS del nuevo dispositivo.
- **Pro**: Compatible con cualquier DID (peer, did:key, etc.).
- **Contra**: Credo no tiene API estándar de "export key"; requiere integración con el KMS.

### Opción B: Seed/mnemonic (estilo Lissi)

- Al crear la wallet, el usuario genera un seed (12/24 palabras).
- DID y claves se derivan de ese seed (determinístico).
- **Backup en cloud**: solo credenciales cifradas.
- **Backup del usuario**: seed guardado offline (papel, otro dispositivo).
- Recuperación: usuario ingresa seed + PIN para descargar credenciales cifradas.
- **Pro**: No guardamos claves; el usuario custodia el seed.
- **Contra**: Si pierde el seed, no hay recuperación. Requiere DID derivable (did:key desde seed).

### Opción C: Re-emisión

- No hay backup de keys.
- Usuario demuestra identidad al issuer por otro canal.
- Issuer re-emite la credencial a un **nuevo DID** en la nueva wallet.
- **Pro**: Más simple; no almacenamos material sensible.
- **Contra**: Pierde continuidad del DID anterior. No es "recuperación" propiamente dicha.

---

## Componentes técnicos

| Componente | Función |
|------------|---------|
| **KDF** | PBKDF2, Argon2 o scrypt para derivar la clave desde el PIN/password |
| **Salt** | Aleatorio por backup, generado en el cliente; se guarda junto al ciphertext |
| **Cifrado** | AES-256-GCM para el payload completo (credencial + keys/seed) |
| **Exportación de keys** | Mecanismo para sacar claves del KMS local y meterlas en el payload (opción A) |
| **Implementación** | Lógica de cifrado/descifrado en el **cliente** (web, mobile, wallet) |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│  Cliente (Wallet / App / Web)                               │
│                                                             │
│  Backup:                                                    │
│  • Payload = { credenciales, DidRecords + keys exportadas } │
│  • key = Argon2(PIN, salt)                                  │
│  • ciphertext = AES-GCM(payload, key)                       │
│  • Envía { ciphertext, salt }                               │
│                                                             │
│  Recuperación:                                              │
│  • Obtiene ciphertext del holder-service                    │
│  • key = Argon2(PIN, salt)                                  │
│  • payload = AES-GCM-decrypt(ciphertext, key)               │
│  • Restaura credenciales + keys en KMS local                 │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTPS + auth (token)
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Holder-Service                                             │
│                                                             │
│  • Valida token del usuario                                 │
│  • Recibe/entrega ciphertext (no key, no PIN, no payload)   │
│  • Persiste en storage                                      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Storage                                                    │
│                                                             │
│  Solo ciphertext + salt + metadata (userId, timestamp)      │
│  Internos con acceso no pueden leer credenciales ni keys    │
└─────────────────────────────────────────────────────────────┘
```

---

## Integración con Credo

Credo persiste credenciales en `W3cCredentialRecord` y DidRecords con referencias a KMS. Para backup/recuperación:

| Aspecto | Consideración |
|---------|---------------|
| **Exportar keys** | Credo/KMS no exponen "export private key" por defecto. Requiere adaptador que acceda al KMS subyacente o uso de seed (opción B). |
| **Formato del payload** | JSON serializado de los records necesarios, con keys inline (opción A) o sin keys si se usa seed (opción B). |
| **Restauración** | Crear records en el nuevo agente vía API (save) o import. |

---

## Trade-offs

| Beneficio | Coste |
|-----------|-------|
| Protección frente a personal con acceso al storage | Si el usuario olvida el PIN, no hay recuperación |
| Recuperación completa (credencial + DID/key) | Más complejidad; hay que decidir opción A, B o C |
| Credenciales y keys ilegibles para el backend | El cliente debe implementar KDF, cifrado y (en A) export de keys |
| Alineado con SSI | Más complejidad en UX y flujos de recuperación |

---

## Medidas complementarias

- **Autenticación del usuario** antes de acceder al holder-service (OAuth, JWT, etc.).
- **Rate limiting** para mitigar ataques por fuerza bruta contra el PIN.
- **Salt único por backup** para evitar reutilización de claves.
- **Auditoría** de accesos al holder-service (quién, cuándo, qué operaciones).
- **Versiones de backup**: permitir varios backups (p. ej. el último N) por si el usuario restaura una versión anterior.

---

## Referencias del ecosistema

| Wallet / Plataforma | Enfoque |
|---------------------|---------|
| **Trinsic** | Zero-Access Encryption; clave en cliente. [Docs](https://docs.trinsic.id/docs/security-data-protection) |
| **Lissi Wallet** | Backup = archivo cifrado + clave de 12 palabras. Usuario necesita ambos. [Blog](https://www.lissi.id/blog/your-data-available-at-any-time-with-the-lissi-wallet-backup) |
| **EU Digital Identity Wallet** | Todo local; no persiste en servidores. [EUDI Architecture](https://eudi.dev/latest/architecture-and-reference-framework-main/) |
| **Polygon ID** | Credenciales cifradas con clave privada del usuario. |

---

## Próximos pasos sugeridos

1. Definir formato del payload de backup (credenciales + DidRecords + keys o seed).
2. Elegir opción A, B o C (keys exportadas vs seed vs re-emisión).
3. Definir formato de payload cifrado (ciphertext, IV, tag, salt).
4. Elegir y documentar KDF y parámetros.
5. Diseñar flujo de creación de PIN y recuperación (UX).
6. Evaluar integración con Credo/KMS para export/import de keys (si opción A).
7. Boceto de API del holder-service para almacenar y recuperar backup cifrado.
