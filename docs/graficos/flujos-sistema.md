# Flujos del sistema

Diagramas que muestran por donde pasa cada proceso y que servicios intervienen.

---

## 1. Creacion de DID (al arrancar issuer/holder/verifier)

Primero se crean la clave privada y la clave publica en el KMS. Despues se genera el DID y el DID Document. Orden:

```
  [issuer/holder/verifier]
           |
           | 1. kms.createKey()  <-  claves PRIMERO (privada + publica)
           v
  +-----------------+
  |  kms-service    |   POST /keys  ->  crea par de claves (privada queda en KMS)
  +--------+--------+
           | keyId, publicJwk
           v
  [CustomDidRegistrar]  construye did:custom + DID Document (a partir de la clave publica)
           |
           | 2. fetch(vdr-service/did)  <-  DID DESPUES
           v
  +-----------------+
  |  vdr-service    |   POST /did  ->  registra did:custom + DID Document
  +--------+--------+
           |
           v
  [CustomDidRegistrar]  crea DidRecord
           |
           | 3. didRepository.save()
           v
  +-----------------+
  | storage-service |   POST /records  ->  guarda DidRecord
  +-----------------+
```

Resumen: KMS (claves privada/publica) -> DID (identificador + documento) -> Storage (DidRecord local).

---

## 2. Crear invitacion (POST /create-invitation)

El issuer genera una URL OOB que incluye su did:custom:

```
  [Cliente]  POST /create-invitation
       |
       v
  [issuer-service]
       |
       | createInvitation(invitationDid=getIssuerDid())
       v
  [Credo oob.createInvitation]
       |
       | 1. Busca DidRecord del issuer
       v
  +-----------------+
  | storage-service |   POST /records/query  (DidRecord, role=created)
  +--------+--------+
           | DidRecord con didDocument
           v
  [Credo]  construye invitacion OOB con services: [did:custom:xxx]
       |
       | 2. Guarda OutOfBandRecord
       v
  +-----------------+
  | storage-service |   POST /records  ->  OutOfBandRecord
  +-----------------+
       |
       v
  [issuer-service]  devuelve invitation (URL didcomm://?oob=...)
```

Servicios implicados: Storage (lectura DidRecord, escritura OutOfBandRecord).

---

## 3. Recibir invitacion (POST /receive-invitation)

El holder recibe la URL, establece conexion DIDComm con el issuer:

```
  [Cliente]  POST /receive-invitation  { invitationUrl }
       |
       v
  [holder-service]
       |
       | receiveInvitationFromUrl(url, ourDid=getHolderDid())
       v
  [Credo]  parsea URL, extrae did del issuer de "services"
       |
       | 1. Resuelve DID del issuer (donde enviar el mensaje)
       v
  +-----------------+
  |  vdr-service    |   GET /did/:id  ->  DID Document con serviceEndpoint
  +--------+--------+
           |
           v
  [Credo]  busca DidRecord del holder (ourDid)
       |
       | 2. getCreatedDids({ did: ourDid })
       v
  +-----------------+
  | storage-service |   POST /records/query  (DidRecord)
  +--------+--------+
           |
           v
  [Credo]  crea ConnectionRecord, envia DID Exchange Request
       |   (HTTP al serviceEndpoint del issuer)
       |
       | 3. Guarda OutOfBandRecord, actualiza ConnectionRecord
       v
  +-----------------+
  | storage-service |   POST /records, PUT /records
  +-----------------+
       |
       v
  [issuer-service]  recibe mensaje DIDComm (puerto 3001)
       |   Procesa request, usa Storage (guardar conexion). Firmar: Credo usa crypto interno (KMS remoto no implementa sign).
       |   Responde al holder
       v
  [holder-service]  recibe respuesta, actualiza conexion
       |
       | 4. Storage (ConnectionRecord)
       v
  +-----------------+
  | storage-service |   PUT /records
  +-----------------+
```

Servicios implicados: DID (resolver issuer), Storage (DidRecord holder, OutOfBandRecord, ConnectionRecord). KMS: solo createKey/getPublicKey; firmar no implementado (Credo usa crypto interno).
