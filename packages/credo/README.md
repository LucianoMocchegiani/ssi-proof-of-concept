# @one/credo

Librería para estandarizar el uso de Credo-TS en issuer-service, holder-service y verifier-service.

## Instalación

```bash
npm install @one/credo
```

En un monorepo con workspaces, agregar al `package.json`:

```json
{
  "dependencies": {
    "@one/credo": "file:../packages/credo"
  }
}
```

## Uso

### Crear agente

```ts
import { createIssuerAgent, createHolderAgent, createVerifierAgent } from '@one/credo'
import type { CredoAgentBaseConfig } from '@one/credo'

const config: CredoAgentBaseConfig = {
  label: 'issuer',
  vdrServiceUrl: 'http://localhost:4003',
  didcommEndpoint: 'ws://localhost:3000',
  didcommPort: 3000,
  walletId: 'issuer-wallet',
  walletKey: 'issuer-key',
  wallet: {
    mode: 'internal',
    connection: '/app/data/internal-wallet.sqlite',
    externalUrl: 'http://localhost:4002',
    walletId: 'issuer-wallet',
  },
  kms: {
    mode: 'internal',
    connection: '/app/data/internal-kms.sqlite',
    externalUrl: 'http://localhost:4001',
  },
}

// Con WebSocket en el mismo servidor HTTP
const agent = await createIssuerAgent(config, { wsServer })
```

### Asegurar DID

```ts
import { ensureDid } from '@one/credo'

const did = await ensureDid(agent, {
  method: 'custom',
  vdrServiceUrl: 'http://localhost:4003',
})
```

### Invitaciones OOB

```ts
import { createInvitation, receiveInvitation } from '@one/credo'

// Crear (issuer/verifier)
const { invitationUrl } = await createInvitation(agent, invitationDid, {
  domain: 'didcomm://',
})

// Recibir (holder)
const outOfBandRecord = await receiveInvitation(agent, invitationUrl, ourDid)
```

## API

- **createIssuerAgent**(config, options?) – Agente solo credentials
- **createHolderAgent**(config, options?) – Agente credentials + proofs
- **createVerifierAgent**(config, options?) – Agente solo proofs
- **ensureDid**(agent, options) – Obtiene o crea did:custom
- **createInvitation**(agent, invitationDid, options?) – Crea invitación OOB
- **receiveInvitation**(agent, invitationUrl, ourDid, options?) – Recibe invitación OOB

## Tipos

- `CredoAgentBaseConfig` – Config base para cualquier agente
- `WalletConfig` – Config de wallet (internal/external)
- `KmsConfig` – Config de KMS (internal/external)
- `CreateAgentOptions` – wsServer, transportCloseDelayMs
