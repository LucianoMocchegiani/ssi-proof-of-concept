import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

/** Bootstrap del DID service. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.DID_SERVICE_PORT || 4003)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`DID Nest service listening on ${port}`)
}

bootstrap()
