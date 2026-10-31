import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { paginationQuery } from '../../lib/pagination';
import { idParam, isoDate } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './billing.controller';

const runBody = z.object({ date: isoDate.optional() }).default({});

const r = Router();
r.post('/billing/run', auth, requireRole('ADMIN'), validate({ body: runBody }), ah(ctrl.run));
r.get('/billing/runs', auth, requireRole('ADMIN'), validate({ query: paginationQuery }), ah(ctrl.runs));
r.post('/subscriptions/:id/invoice', auth, requireRole('ADMIN', 'STAFF'), validate({ params: idParam }), ah(ctrl.billSubscription));
export default r;
