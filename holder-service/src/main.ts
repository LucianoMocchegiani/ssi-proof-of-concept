import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { envConfig } from './config'
import { initializeHolderAgent, ensureHolderDid } from './agent/agent-holder'
import { setHolderAgent } from './agent/agent-store'
import { setHolderDid } from './agent/holder-did-store'
import { WebSocketServer } from 'ws'

const logger = new Logger('Holder')

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', reason)
})
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', err)
})

/** Bootstrap: Nest maneja HTTP (rutas), luego adjuntamos WebSocket DIDComm al mismo servidor. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = envConfig.port

  await app.listen(port)
  const httpServer = app.getHttpServer()
  const wsServer = new WebSocketServer({ server: httpServer })

  const agent = await initializeHolderAgent(wsServer)
  setHolderAgent(agent)
  const did = await ensureHolderDid(agent)
  setHolderDid(did)
  logger.log(`Agent initialized did=${did}`)
  logger.log(`Listening on ${port} (API + DIDComm WebSocket)`)
}

bootstrap().catch(err => {
  logger.error('Bootstrap failed', err)
  process.exit(1)
})
