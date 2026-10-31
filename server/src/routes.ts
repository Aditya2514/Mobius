import { Router } from 'express';

/** Mounted at /api/v1. Each module adds its router here as it is built. */
export const routes = Router();

routes.get('/health', (_req, res) => {
  res.json({ ok: true });
});
