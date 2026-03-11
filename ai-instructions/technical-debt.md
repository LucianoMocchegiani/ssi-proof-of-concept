# Technical Debt – Stack Credo SSI

Registro de deuda técnica identificada post-migración a @one/credo. Ordenado por prioridad sugerida.

---

## Completado (centralización CredentialsService)

- [x] **VDR status client** (`@one/credo/vdr`): allocateStatusIndex, resolveStatusListId, registerCredentialMapping, checkCredentialStatus, revokeCredential
- [x] **Credential builders** (`@one/credo/utils/credential-builders`): buildOfferCredentialPayload, buildProposalCredentialPayload, buildCredentialContext, getProofOptions, toCredentialPayload
- [x] **Presentation definition** (`@one/credo/utils/presentation-definition`): buildGenericPresentationDefinition
- [x] **Credential flows** (`@one/credo/credentials`): offerCredential, proposeCredential, requestProof – flujos completos centralizados
- [x] **Refactor de issuer/holder/verifier CredentialsService**: Servicios reducidos a capa HTTP/DI que delegan en @one/credo

---

## 1. Documentación

- [ ] **README `packages/credo`**: Verificar que incluya `logger`, ejemplos actualizados y sección "Centralizado vs no centralizado".
- [ ] **README por servicio**: Añadir sección "Arquitectura" que indique qué aporta @one/credo y qué queda local (stores, endpoints, reglas de negocio).
- [ ] **Arquitectura general**: Documentar flujo completo (bootstrap → DID → StatusList → listeners).

---

## 2. Stores y estado en memoria

| Componente | Situación | Riesgo |
|------------|-----------|--------|
| `issuer-did-store`, `holder-did-store`, `verifier-did-store` | Variables en memoria | Pierden DID al reinicio |
| `issuer-status-list-store` | Variable en memoria | Pierde status list al reinicio |
| `agent-store` | Variable en memoria | - |

- [ ] Considerar persistir DID y status list en DB o secretos (no solo memoria).
- [ ] Para múltiples pods: almacenamiento compartido o estrategia de alta disponibilidad.
- [ ] Evaluar reemplazo por inyección de dependencias en lugar de módulos/singletons.

---

## 3. Seguridad y configuración

- [ ] **walletKey en env**: Mover a secret manager/vault en lugar de variables de entorno.
- [ ] **Validación de env**: Añadir validación (zod/joi) de `CredoEnvConfig` al arrancar.
- [ ] **VDR**: Si el VDR es expuesto o multi-tenant, implementar autenticación/autorización.

---

## 4. Observabilidad

- [ ] **Métricas** (Prometheus/OpenTelemetry): Contador de exchanges (credentials, proofs), estados y errores.
- [ ] **Tracing**: Trace IDs en logs y propagación entre issuer → holder → verifier.
- [ ] **Health checks**: Endpoints que verifiquen conectividad con VDR, KMS externo y wallet externo.

---

## 5. Código

- [ ] Reducir `as any` en adapters y listeners para mejorar tipos.
- [ ] Definir `CredoError` y subclases para errores de la librería y mejor manejo en servicios.
- [ ] Revisar uso de `agent-store` y stores; evaluar inyección de dependencias.

---

## 6. CI/CD

- [ ] **Monorepo**: Scripts en raíz para build, lint y (opcional) tests de todos los paquetes.
- [ ] **Docker**: Validar build de imágenes con `packages/credo` post-migración.
- [ ] **Versiones**: Si se publica @one/credo (npm privado, etc.), usar semver y changelog.

---

## Prioridades sugeridas

| Prioridad | Item | Esfuerzo |
|-----------|------|----------|
| Alta | Validación de CredoEnvConfig (zod/joi) | Bajo |
| Alta | Health checks para VDR/KMS/wallet | Medio |
| Media | Documentar arquitectura en READMEs | Bajo |
| Media | Métricas básicas | Medio |
| Baja | Persistencia de stores (DID, status list) | Alto |
| Baja | Reemplazar stores por DI | Alto |
| Baja | CredoError y subclases | Medio |

---

## Excluido de este documento

- **Tests**: Registrado aparte (unitarios en @one/credo, integración E2E).
