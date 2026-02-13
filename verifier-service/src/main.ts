import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { envConfig } from './config'
import { initializeVerifierAgent, ensureVerifierDid } from './agent/agent-verifier'
import { setVerifierAgent } from './agent/agent-store'
import { setVerifierDid } from './agent/verifier-did-store'

/** Bootstrap: inicializa agente y DID, luego levanta HTTP. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = envConfig.port

  const agent = await initializeVerifierAgent()
  setVerifierAgent(agent)
  const did = await ensureVerifierDid(agent)
  setVerifierDid(did)
  // eslint-disable-next-line no-console
  console.log('Verifier agent initialized', { did })

  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`Verifier service listening on ${port}`)
}

bootstrap().catch(err => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap failed', err)
  process.exit(1)
})

