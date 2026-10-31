import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './report.controller';
import { overdueQuery, revenueQuery } from './report.schema';

const TEAM = ['ADMIN', 'STAFF'] as const;

const r = Router();
r.get('/reports/summary', auth, requireRole(...TEAM), ah(ctrl.summary));
r.get('/reports/revenue', auth, requireRole(...TEAM), validate({ query: revenueQuery }), ah(ctrl.revenue));
r.get('/reports/overdue', auth, requireRole(...TEAM), validate({ query: overdueQuery }), ah(ctrl.overdue));
r.get('/reports/subscriptions-by-plan', auth, requireRole(...TEAM), ah(ctrl.subscriptionsByPlan));
export default r;
