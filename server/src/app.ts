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
  // behind a reverse proxy (production), key rate limits on the real client IP, not the proxy's
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors({ origin: env.APP_URL, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  // Postgres cannot store NUL characters in text; reject them cleanly instead of returning a 500
  app.use((req, res, next) => {
    if (req.body && JSON.stringify(req.body).includes('\\u0000')) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid character in input' } });
    }
    next();
  });
  // logs method, url, status and responseTime for every request
  app.use(pinoHttp({ logger }));

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
