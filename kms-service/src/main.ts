import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

/** Bootstrap del KMS. Puerto por KMS_SERVICE_PORT. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
  }))
  const port = Number(process.env.KMS_SERVICE_PORT || 4001)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`KMS Nest service listening on ${port}`)
}

bootstrap()

