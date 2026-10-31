import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { routes } from './routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.APP_URL, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  // logs method, url, status and responseTime for every request
  app.use(pinoHttp({ logger }));

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
