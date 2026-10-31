import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './customer.controller';
import { createCustomerBody, listCustomersQuery, updateCustomerBody } from './customer.schema';

const r = Router();
r.get('/customers', auth, requireRole('ADMIN', 'STAFF'), validate({ query: listCustomersQuery }), ah(ctrl.list));
r.post('/customers', auth, requireRole('ADMIN', 'STAFF'), validate({ body: createCustomerBody }), ah(ctrl.create));
r.get('/customers/:id', auth, requireRole('ADMIN', 'STAFF'), validate({ params: idParam }), ah(ctrl.get));
r.patch(
  '/customers/:id',
  auth,
  requireRole('ADMIN', 'STAFF'),
  validate({ params: idParam, body: updateCustomerBody }),
  ah(ctrl.update),
);
export default r;
