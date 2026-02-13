# Distribución de storage en SSI

Documenta qué información persiste Issuer, Holder y Verifier en los flujos de credencial y prueba. Sirve para decidir cómo dividir el storage (p. ej. holder con storage local en su wallet).

---

## Emisión de credencial

### Emisor (Issuer)

| Record | Qué guarda |
|--------|------------|
| **CredentialExchangeRecord** | Metadata: threadId, connectionId, state, credentialAttributes (preview de claims, no valores), role=issuer |
| **DidCommMessageRecord** | Offer, Request, **Issue-credential** (contiene `credentialAttachments` = credencial completa) |
| **ConnectionRecord** | Conexión con el holder |

> El mensaje `issue-credential` incluye la credencial en los attachments. Credo lo persiste por defecto → el issuer también guarda una copia completa de la credencial.

---

### Holder

| Record | Qué guarda |
|--------|------------|
| **CredentialExchangeRecord** | Metadata + `credentials: [{ credentialRecordId }]` (referencia) |
| **W3cCredentialRecord** / **AnonCredsCredentialRecord** | Credencial completa (claims + firma) |
| **DidCommMessageRecord** | Offer, Request, Issue-credential (credencial en attachments) |
| **ConnectionRecord** | Conexión con el issuer |

---

### Verifier

No participa en la emisión. No guarda nada en este flujo.

---

## Flujo de presentación / prueba (Proof)

### Holder

Usa el `W3cCredentialRecord` existente para crear la presentación. No crea records nuevos de credencial.

### Verifier

| Record | Qué guarda |
|--------|------------|
| **ProofExchangeRecord** | Metadata del flujo de prueba |
| **DidCommMessageRecord** | Mensaje de presentación (contiene las credenciales presentadas) |
| **ConnectionRecord** | Conexión con el holder |

---

## Resumen: dónde está la credencial completa

| Rol | ¿Tiene la credencial completa? | Dónde |
|-----|-------------------------------|-------|
| **Issuer** | Sí | `DidCommMessageRecord` (issue-credential) |
| **Holder** | Sí | `W3cCredentialRecord` + `DidCommMessageRecord` |
| **Verifier** | Sí | `DidCommMessageRecord` (presentation) |

---

## Implicaciones para arquitectura

- **Holder**: debería custodiar sus credenciales en storage local (wallet). Las credenciales viven en `W3cCredentialRecord`; el holder es quien las necesita para presentar.
- **Issuer**: crea y envía la credencial; no la necesita después. Credo la persiste en `DidCommMessageRecord` por historial.
- **Verifier**: recibe y valida la presentación; no la necesita después. Credo la persiste en `DidCommMessageRecord` por auditoría.

**Recomendación**: Cada holder debería tener su propio storage (local, en memoria, en su wallet) para cumplir con el principio de self-sovereign identity: la credencial vive bajo custodia del holder.

---

## Límites de seguridad: medidas técnicas vs. amenaza interna

Las medidas de seguridad (CORS, red aislada, autenticación) **mitigan ataques externos**, pero **no eliminan** el riesgo de que alguien con acceso legítimo filtre los datos.

| Protegen contra | No protegen contra |
|-----------------|--------------------|
| Ataques externos (internet) | Personal interno con acceso (admins, DevOps, DBA, desarrolladores) |
| Servicios no autorizados | Credenciales de servicios comprometidas |
| Tráfico en red pública | Malware en máquinas internas |

**El problema de fondo**: Si el holder usa un holder-service centralizado que guarda credenciales en storage, ese servicio es custodio. Los datos pasan por nuestros sistemas; quien tenga acceso legítimo puede extraerlos. Es custodia delegada, no SSI puro.

**Opciones para mayor seguridad**:

| Opción | Efecto |
|--------|--------|
| Holder = wallet local (app móvil, desktop) | Las credenciales solo viven en el dispositivo del usuario; no pasan por nuestros servidores. |
| Cifrado con clave del usuario | Cifrar credenciales con clave derivada de PIN/biometrics; sin la clave del usuario, el dato es ilegible aunque alguien acceda al storage. |
| Auditoría | Registro de accesos para detectar accesos sospechosos. |
