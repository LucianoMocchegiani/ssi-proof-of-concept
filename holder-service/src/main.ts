import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { envConfig } from './config'
import { initializeHolderAgent, ensureHolderDid } from './agent/agent-holder'
import { setHolderAgent } from './agent/agent-store'
import { setHolderDid } from './agent/holder-did-store'

/** Bootstrap: inicializa agente y DID, luego levanta HTTP. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = envConfig.port

  const agent = await initializeHolderAgent()
  setHolderAgent(agent)
  const did = await ensureHolderDid(agent)
  setHolderDid(did)
  // eslint-disable-next-line no-console
  console.log('Holder agent initialized', { did })

  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`Holder service listening on ${port}`)
}

bootstrap().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap failed', err)
  process.exit(1)
})

