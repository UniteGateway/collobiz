import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { config } from './config';

export async function createApp(opts: { logger?: boolean } = {}) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: opts.logger === false ? false : ['error', 'warn', 'log'] });
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: any, res: any, next: () => void) => {
    req.headers['x-request-id'] ??= randomUUID();
    res.setHeader('X-Request-Id', req.headers['x-request-id']);
    next();
  });
  app.enableCors({ origin: config().CORS_ORIGINS.split(','), credentials: true });
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();
  return app;
}

export function buildOpenApi(app: NestExpressApplication) {
  const doc = new DocumentBuilder()
    .setTitle('COLLABIZ API')
    .setDescription('Unite-first hybrid B2B collaboration platform — powered by Unite Group. Authentication: Bearer access token (mobile) or httpOnly cookie + X-CZ-CSRF header (web). Tenant context: X-Org-Id header validated against memberships.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Org-Id' }, 'org')
    .build();
  return SwaggerModule.createDocument(app, doc);
}
