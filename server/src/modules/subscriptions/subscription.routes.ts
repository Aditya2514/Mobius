import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './subscription.controller';
import {
  createSubscriptionBody, historyQuery, lineBody, listSubscriptionsQuery, subLineParams, transitionBody,
  updateLineBody, updateSubscriptionBody,
} from './subscription.schema';

const ALL = ['ADMIN', 'STAFF', 'CUSTOMER'] as const; // customers are scoped to their own rows in the service
const TEAM = ['ADMIN', 'STAFF'] as const;

const r = Router();
r.get('/subscriptions', auth, requireRole(...ALL), validate({ query: listSubscriptionsQuery }), ah(ctrl.list));
r.post('/subscriptions', auth, requireRole(...TEAM), validate({ body: createSubscriptionBody }), ah(ctrl.create));
r.get('/subscriptions/:id', auth, requireRole(...ALL), validate({ params: idParam }), ah(ctrl.get));
r.patch('/subscriptions/:id', auth, requireRole(...TEAM), validate({ params: idParam, body: updateSubscriptionBody }), ah(ctrl.update));

r.post('/subscriptions/:id/lines', auth, requireRole(...TEAM), validate({ params: idParam, body: lineBody }), ah(ctrl.addLine));
r.patch(
  '/subscriptions/:id/lines/:lineId',
  auth,
  requireRole(...TEAM),
  validate({ params: subLineParams, body: updateLineBody }),
  ah(ctrl.updateLine),
);
r.delete('/subscriptions/:id/lines/:lineId', auth, requireRole(...TEAM), validate({ params: subLineParams }), ah(ctrl.deleteLine));

// the only way a subscription's status changes (AGENTS.md rule 7); customers: pause/resume/close on their own
r.post('/subscriptions/:id/transition', auth, requireRole(...ALL), validate({ params: idParam, body: transitionBody }), ah(ctrl.transition));
r.get('/subscriptions/:id/history', auth, requireRole(...TEAM), validate({ params: idParam, query: historyQuery }), ah(ctrl.history));
export default r;
