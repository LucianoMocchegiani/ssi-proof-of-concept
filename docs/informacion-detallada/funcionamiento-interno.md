## Funcionamiento interno de Credo

### Crear DID 

**1. `agent.dids.create({ method: 'custom', options: {} })`**
- **Credo** → `DidRegistrarService` selecciona `CustomDidRegistrar`
- **CustomDidRegistrar**:
  - **KMS**: `kms.createKey({ type: Ed25519 })` → crea clave, **clave privada queda en KMS**
  - **vdr-service**: `POST /did` con `{ id: did, document }` → registra el documento DID
  - **Storage**: vía `didRepository.save()` → guarda `DidRecord` (metadata: did, didDocument, kmsKeyId)
- Devuelve `{ did }`

---

### Crear invitación 

**2. `agent.didcomm.oob.createInvitation({ invitationDid: did })`**
- **Credo** → `DidCommOutOfBandApi.createInvitation()`
- Con `invitationDid`: no llama a `routingService.getRouting` (no usa KMS para claves inline)
- Construye `DidCommOutOfBandInvitation` con `services: [did]`
- Añade `handshake_protocols` según la config del agente
- Guarda `DidCommOutOfBandRecord` en **Storage**
- Devuelve `outOfBandRecord`

**3. `outOfBandRecord.outOfBandInvitation.toUrl({ domain })`**
- **Credo** → `toJSON()` del mensaje → `JsonEncoder.toBase64URL()` → `{domain}?oob={base64}`

**Resumen emisor:** KMS (crear clave), vdr-service (registrar DID), Storage (DidRecord + OutOfBandRecord).

---

### Procesar invitación (Holder)

**1. `agent.didcomm.oob.receiveInvitationFromUrl(invitationUrl)`**
- **Credo** → `parseInvitationShortUrl()`: extrae `oob`, decodifica base64 → JSON → `DidCommOutOfBandInvitation`
- Llama a `_receiveInvitation()`

**2. `resolveInvitationRecipientKeyFingerprints(outOfBandInvitation)`**
- **Credo** ve `services: ["did:custom:..."]` (string = DID)
- Llama a `didCommDocumentService.resolveServicesFromDid(agentContext, did)`
- **Credo** usa el **DidResolver** registrado → **CustomDidResolver**
- **CustomDidResolver**: `GET {vdr-service}/did/{did}` → obtiene el documento DID
- Extrae `recipientKeys` del documento (verificationMethod)
- Devuelve fingerprints para etiquetar el record

**3. Crea `DidCommOutOfBandRecord` (receptor)**
- **Storage**: guarda el record en Storage

**4. Si `autoAcceptInvitation` → inicia handshake**
- Holder envía **Connection Request** (o DID Exchange Request)
- Para firmar su mensaje, el holder necesita una clave → **KMS** (crear clave o usar existente)
- **Storage**: guarda `ConnectionRecord`
- El mensaje se envía por HTTP al endpoint del issuer (obtenido del DID resuelto)

**Resumen holder:** vdr-service (resolver DID), Storage (OutOfBandRecord, ConnectionRecord), KMS (clave para el handshake).

---

### Handshake (Issuer recibe request)

**5. Issuer recibe Connection Request**
- **Credo** procesa el mensaje entrante
- Para **verificar** la firma del holder: usa la clave pública del documento que el holder envió (no KMS del issuer)
- Para **firmar** la respuesta: usa la clave del DID de la invitación → **KMS** (getKey/sign con `kmsKeyId` del DidRecord)
- **Storage**: actualiza `ConnectionRecord`, estado → Completed

**6. Holder recibe Connection Response**
- Verifica firma del issuer con el DID document que ya resolvió
- **Storage**: actualiza `ConnectionRecord` → Completed
- Conexión establecida

---

## Diagrama de componentes por momento

| Momento | KMS | Storage | vdr-service |
|---------|-----|---------|-------------|
| Emisor: `dids.create` | ✅ Crear clave Ed25519 | ✅ DidRecord | ✅ POST /did |
| Emisor: `createInvitation` | — | ✅ OutOfBandRecord | — |
| Holder: `receiveInvitationFromUrl` | — | ✅ OutOfBandRecord | ✅ GET /did/:id (resolver) |
| Holder: enviar Connection Request | ✅ Crear clave (peer DID) | ✅ ConnectionRecord | — |
| Issuer: firmar Connection Response | ✅ Sign con clave del DID | ✅ ConnectionRecord | — |
| Holder: completar conexión | — | ✅ ConnectionRecord | — |
