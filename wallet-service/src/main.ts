import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

/** Log todas las peticiones al wallet-service para depurar flujos OOB/DID. */
function requestLogger(req: any, _res: any, next: () => void) {
  // eslint-disable-next-line no-console
  console.log(`[wallet] INCOMING ${req.method} ${req.originalUrl ?? req.url}`)
  next()
}

/** Bootstrap del wallet-service. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.use(requestLogger)
  const port = Number(process.env.WALLET_SERVICE_PORT || 4002)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`Wallet Nest service listening on ${port}`)
}

bootstrap()

