import 'reflect-metadata'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { envConfig } from './config'
import { initializeVerifierAgent, ensureVerifierDid } from './agent/agent-verifier'
import { setVerifierAgent } from './agent/agent-store'
import { setVerifierDid } from './agent/verifier-did-store'
import { WebSocketServer } from 'ws'

const logger = new Logger('Verifier')

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', reason)
})
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', err)
})

/** Bootstrap: Nest maneja HTTP, WebSocket DIDComm se adjunta al mismo servidor. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  const port = envConfig.port

  await app.listen(port)
  const httpServer = app.getHttpServer()
  const wsServer = new WebSocketServer({ server: httpServer })

  const agent = await initializeVerifierAgent(wsServer)
  setVerifierAgent(agent)
  const did = await ensureVerifierDid(agent)
  setVerifierDid(did)
  logger.log(`Agent initialized did=${did}`)
  logger.log(`Listening on ${port} (API + DIDComm WebSocket)`)
}

bootstrap().catch(err => {
  logger.error('Bootstrap failed', err)
  process.exit(1)
})

