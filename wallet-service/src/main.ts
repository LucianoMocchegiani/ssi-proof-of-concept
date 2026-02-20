import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { AppModule } from './app.module'

function requestLogger(req: { method: string; originalUrl?: string; url: string }, _res: unknown, next: () => void) {
  console.log(`[wallet] INCOMING ${req.method} ${req.originalUrl ?? req.url}`)
  next()
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
  }))
  app.use(requestLogger)
  const port = Number(process.env.WALLET_SERVICE_PORT || 4002)
  await app.listen(port)
  console.log(`Wallet Nest service listening on ${port}`)
}

bootstrap()
