import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// Endpoints already live on the real server (update at each sync point)
const LIVE = (import.meta.env.VITE_LIVE_PREFIXES ?? '').split(',').filter(Boolean);

const active = handlers.filter(
  (h) => !LIVE.some((p) => h.info?.path?.toString()?.includes(`/api/v1${p}`))
);

export const worker = setupWorker(...active);

