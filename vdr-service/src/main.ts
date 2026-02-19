import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

/** Bootstrap del VDR service. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const port = Number(process.env.VDR_SERVICE_PORT || 4003)
  await app.listen(port)
  // eslint-disable-next-line no-console
  console.log(`VDR Nest service listening on ${port}`)
}

bootstrap()
