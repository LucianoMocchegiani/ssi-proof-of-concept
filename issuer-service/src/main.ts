import 'reflect-metadata'
import { Logger, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { envConfig } from './config'
import { initializeIssuerAgent, ensureIssuerDid } from './agent/agent-issuer'
import { setIssuerAgent } from './agent/agent-store'
import { setIssuerDid } from './agent/issuer-did-store'
import { WebSocketServer } from 'ws'

const logger = new Logger('Issuer')

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

  const agent = await initializeIssuerAgent(wsServer)
  setIssuerAgent(agent)
  const did = await ensureIssuerDid(agent)
  setIssuerDid(did)
  logger.log(`Agent initialized did=${did}`)
  logger.log(`Listening on ${port} (API + DIDComm WebSocket)`)
}

bootstrap().catch(err => {
  logger.error('Bootstrap failed', err)
  process.exit(1)
})
