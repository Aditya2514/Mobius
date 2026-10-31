import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './plan.controller';
import { createPlanBody, listPlansQuery, updatePlanBody } from './plan.schema';

const READ = ['ADMIN', 'STAFF', 'CUSTOMER'] as const;

const r = Router();
r.get('/plans', auth, requireRole(...READ), validate({ query: listPlansQuery }), ah(ctrl.list));
r.post('/plans', auth, requireRole('ADMIN'), validate({ body: createPlanBody }), ah(ctrl.create));
r.get('/plans/:id', auth, requireRole(...READ), validate({ params: idParam }), ah(ctrl.get));
r.patch('/plans/:id', auth, requireRole('ADMIN'), validate({ params: idParam, body: updatePlanBody }), ah(ctrl.update));
export default r;
