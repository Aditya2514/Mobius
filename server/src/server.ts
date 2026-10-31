import { createApp } from './app';
import { env } from './config/env';
import { startScheduler } from './jobs/scheduler';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const server = createApp().listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}/api/v1`);
});
const scheduler = startScheduler();
logger.info(`billing scheduled: "${env.BILLING_CRON}" Asia/Kolkata`);

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  await scheduler.stop();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
