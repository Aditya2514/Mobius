import cron from 'node-cron';
import { env } from '../config/env';
import { todayIST } from '../lib/dates';
import { logger } from '../lib/logger';
import { runBilling } from '../modules/billing/engine';

/** Daily billing (and auto-close) at 00:05 India time, for India's date (UTC is still yesterday then). */
export function startScheduler() {
  return cron.schedule(
    env.BILLING_CRON,
    async () => {
      try {
        const result = await runBilling(todayIST());
        logger.info({ ...result, errors: result.errors.length }, 'scheduled billing run finished');
      } catch (err) {
        logger.error({ err }, 'scheduled billing run failed');
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
