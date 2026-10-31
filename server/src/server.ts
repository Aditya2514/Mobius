import { createApp } from './app';
import { env } from './config/env';
import { startScheduler } from './jobs/scheduler';
import { logger } from './lib/logger';
import { closeBrowser } from './lib/pdf';
import { prisma } from './lib/prisma';

const server = createApp().listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}/api/v1`);
});
const scheduler = env.ENABLE_SCHEDULER ? startScheduler() : null;
logger.info(
  scheduler
    ? `billing scheduled: "${env.BILLING_CRON}" Asia/Kolkata`
    : 'billing scheduler off (ENABLE_SCHEDULER is not true); use POST /billing/run',
);

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  await scheduler?.stop();
  server.close();
  await closeBrowser();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
