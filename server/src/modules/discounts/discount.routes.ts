import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './discount.controller';
import { createDiscountBody, listDiscountsQuery, updateDiscountBody } from './discount.schema';

// Staff may read discounts; only ADMIN creates or changes them.
const r = Router();
r.get('/discounts', auth, requireRole('ADMIN', 'STAFF'), validate({ query: listDiscountsQuery }), ah(ctrl.list));
r.post('/discounts', auth, requireRole('ADMIN'), validate({ body: createDiscountBody }), ah(ctrl.create));
r.get('/discounts/:id', auth, requireRole('ADMIN', 'STAFF'), validate({ params: idParam }), ah(ctrl.get));
r.patch(
  '/discounts/:id',
  auth,
  requireRole('ADMIN'),
  validate({ params: idParam, body: updateDiscountBody }),
  ah(ctrl.update),
);
export default r;
