import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');
  // Behind a reverse proxy, so req.ip (used in the audit trail) is the real client.
  app.set('trust proxy', 'loopback');
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:4220')
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT ?? 3030;
  await app.listen(port);
  console.log(`DeltaSynk Portal API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
