# Preguntas del equipo

---

## 1. Limpieza de records al completar flujos

### Información obtenida

Credo no documenta explícitamente que guarde los records “para auditoría”; lo que sabemos es el comportamiento:

**Durante el flujo** — Persistencia = continuidad  
- Credo persiste para mantener el estado si el proceso se reinicia y poder continuar el flujo.  
- Motivo: no perder trabajo a medio hacer.

**Después de completar** — Ya no es necesario para continuar  
- Credo igual mantiene el record. Motivos plausibles:
  - Historial/auditoría (qué credenciales se emitieron, qué pruebas se verificaron)
  - Desduplicación (detectar si un mensaje ya se procesó)
  - API (listar credenciales/pruebas pasadas)
  - Simplicidad (sin borrado automático; cada app decide si borra)

**Resumen:** Durante el flujo → persistencia para continuidad ✅. Tras completar → en la práctica funcionan como historial/auditoría.

### Evidencia de la investigación (afirmación verificada)

| Fuente | Hallazgo |
|--------|----------|
| Documentación Credo | No documenta borrado automático ni políticas de limpieza |
| Código credo-ts | No existe `autoRemove` ni opciones equivalentes |
| [GitHub Issue #2123](https://github.com/openwallet-foundation/credo-ts/issues/2123) | "Add an auto delete capability..." (dic 2024) — confirma que hoy no existe |
| Credo API | Solo borrado manual vía `deleteById()` |

### Referencia Aries (para implementar algo similar)

En Hyperledger Aries (ACA-Py, iGrant) existe **`autoRemove`**:
- `autoRemove: true` → elimina el record al completar
- `autoRemove: false` → persiste (auditoría)

Config global tipo `--preserve-exchange-records`. Fuentes: [Aries RFC 0453](https://identity.foundation/aries-rfcs/latest/features/0453-issue-credential-v2/), [iGrant - Issue credential](https://docs.igrant.io/docs/aries-api/issue-credential).

---

### Pregunta

**¿Cómo lo manejamos hoy actualmente en Quark?** (Entendiendo que Credo no elimina automáticamente los records cuando un flujo termina.)

---

## 2. Seguridad de la información guardada (credenciales en storage)

### Información obtenida

La credencial emitida se guarda **completa** en el storage. El `CredentialExchangeRecord` solo guarda la referencia (`credentialRecordId`); el contenido real está en `W3cCredentialRecord` o `AnonCredsCredentialRecord`, en el campo `credentialInstances`, que incluye claims, firma del issuer, etc.

Si alguien tiene acceso al storage, puede extraer credenciales y usarlas como propias, porque:
- Las credenciales W3C (JWT, LD-Proof) son autocontenidas; en muchos flujos el verifier solo valida la firma del issuer
- Posesión del VC = posibilidad de presentarlo
- AnonCreds requiere credencial + link secret (KMS); si ambos están comprometidos, el robo es completo
- Si issuer, holder y verifier comparten el mismo storage sin aislamiento, cualquiera podría ver credenciales del holder

### Evidencia de la investigación

| Record | Qué guarda |
|--------|------------|
| `CredentialExchangeRecord` | Solo `credentialRecordId` (referencia) |
| `W3cCredentialRecord` | Credencial completa en `credentialInstances` (claims + firma) |
| `AnonCredsCredentialRecord` | Credencial + referencia a `linkSecretId` |

**Medidas típicas:** almacenamiento aislado para el holder, cifrado en reposo, control de acceso y, opcionalmente, cifrado a nivel de aplicación de campos sensibles.

---

### Pregunta

**¿Qué pasa con la información guardada de la credencial? Si alguien tiene acceso al storage, ¿puede usar la credencial de otra persona?** ¿Cómo mitigamos este riesgo en nuestra arquitectura?
