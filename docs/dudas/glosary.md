# Glosario

## DIDComm

Protocolo de mensajería para comunicación entre agentes de identidad. Los mensajes se cifran con las claves del destinatario (obtenidas de su DID) y se firman con las del remitente. DIDComm define el formato de los mensajes y los transports (HTTP, WebSocket, etc.).

## Handshake

En DIDComm, el **handshake** es el proceso por el cual dos agentes establecen una conexión verificada. Intercambian mensajes según un protocolo (p. ej. DID Exchange o Connections 1.0) hasta que ambos quedan en estado "conectado". Una vez completado, la conexión permite intercambiar credenciales, pruebas y otros mensajes cifrados.

## Record

Un **record** es una entidad que Credo usa para representar el estado de una interacción o identidad dentro del agente. Se persiste vía StorageService para mantener el estado entre reinicios y poder reutilizar conexiones. Cada record tiene un `type` y un `id`; Credo tiene varios tipos:

| Record | Qué representa |
|--------|----------------|
| **DidRecord** | Un DID que el agente creó (con referencias a claves en KMS) |
| **ConnectionRecord** | Una conexión DIDComm establecida con otra parte |
| **DidCommOutOfBandRecord** | Una invitación OOB (creada o recibida) |
| **CredentialExchangeRecord** | Flujo de emisión de credencial (offer, request, issue) |
| **ProofExchangeRecord** | Flujo de presentación de prueba |
| **StorageVersionRecord** | Versión del framework (para migraciones) |

La persistencia permite saber qué DIDs existen, qué conexiones tenemos y en qué estado están los flujos de credenciales o pruebas.

El término "record" como entidad de estado persistente es característico de frameworks como **Credo** y **Aries**. En el ecosistema SSI/VC más amplio se usa el mismo concepto, pero con nombres y arquitecturas distintas:

| Plataforma / contexto | Uso del concepto |
|----------------------|------------------|
| **Aries Framework** | Usa "records" de forma similar (ConnectionRecord, CredentialExchangeRecord, etc.). |
| **Sovrin / Hyperledger Indy** | Persisten datos en wallets/ledger, pero no emplean el término "record" así. |
| **W3C / especificaciones** | Hablan de "state", "credentials", "proofs"; no definen "record" como concepto estándar. |
| **OpenID4VCI / OpenID4VP** | Enfocados en flujos y tokens; no usan "record" como entidad. |

Lo que sí es estándar es la idea subyacente: persistir **estado de interacciones** para continuidad entre sesiones; las especificaciones suelen hablar de "state machines", "sessions" o similares.

## SDK

**SDK** = Software Development Kit. Conjunto de librerías y herramientas que te permiten integrar tu aplicación con un sistema externo. En SSI: Indy SDK (conectar con ledger Indy), Hedera SDK (conectar con Hedera), Credo-TS (DIDs, credenciales, DIDComm). No es infraestructura que corras; es código que usás en tu backend o servicio.

## NYM

Objeto del ledger **Hyperledger Indy** que representa una identidad / DID anclada en el ledger. "NYM" viene de "verinym" (identidad verificable). Solo entidades con permisos pueden escribir un NYM; el autor se convierte en el dueño del DID embebido. Es la forma que tiene Indy de registrar DIDs on-chain. En otros métodos (did:web, did:key) no existe NYM.

## Schema

Objeto del ledger **Hyperledger Indy** que define la **estructura** de una credencial: qué atributos tiene (nombre, fecha_nacimiento, etc.). Es un "template". Antes de emitir credenciales, el issuer debe publicar un schema en el ledger. Los holdes y verifiers lo usan para validar que la credencial cumple con la estructura esperada. Fuera de Indy, los schemas pueden definirse de otras formas (JSON Schema, vocabularios JSON-LD, etc.).

## cred_def (Credential Definition)

Objeto del ledger **Hyperledger Indy** que un issuer crea para ligar sus **claves públicas** a un schema determinado. Indica: "este issuer emite credenciales de este schema con estas claves para firmar/ocultar atributos". Es requisito previo a emitir credenciales. Una vez publicada, suele ser inmutable (rotar claves invalida credenciales emitidas con la anterior). Holders y verifiers usan el cred_def para validar las firmas de las credenciales.
