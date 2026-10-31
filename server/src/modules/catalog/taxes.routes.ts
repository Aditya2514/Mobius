import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './taxes.controller';
import { createTaxBody, listTaxesQuery, updateTaxBody } from './taxes.schema';

const r = Router();
r.get('/taxes', auth, requireRole('ADMIN', 'STAFF', 'CUSTOMER'), validate({ query: listTaxesQuery }), ah(ctrl.list));
r.post('/taxes', auth, requireRole('ADMIN'), validate({ body: createTaxBody }), ah(ctrl.create));
r.patch('/taxes/:id', auth, requireRole('ADMIN'), validate({ params: idParam, body: updateTaxBody }), ah(ctrl.update));
r.delete('/taxes/:id', auth, requireRole('ADMIN'), validate({ params: idParam }), ah(ctrl.remove));
export default r;
