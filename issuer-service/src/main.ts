import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { envConfig } from './config'
import { initializeIssuerAgent, ensureIssuerDid } from './agent/agent-issuer'
import { setIssuerAgent } from './agent/agent-store'
import { setIssuerDid } from './agent/issuer-did-store'

/** Bootstrap: inicializa agente y DID, luego levanta HTTP. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = envConfig.port

  const agent = await initializeIssuerAgent()
  setIssuerAgent(agent)
  const did = await ensureIssuerDid(agent)
  setIssuerDid(did)
  // eslint-disable-next-line no-console
  console.log('Issuer agent initialized', { did })

  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`Issuer service listening on ${port}`)
}

bootstrap().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap failed', err)
  process.exit(1)
})

