import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import { updateVariantBody, variantBody } from './products.schema';
import * as ctrl from './variants.controller';

const r = Router();
r.post('/products/:id/variants', auth, requireRole('ADMIN'), validate({ params: idParam, body: variantBody }), ah(ctrl.create));
r.patch(
  '/variants/:id',
  auth,
  requireRole('ADMIN'),
  validate({ params: idParam, body: updateVariantBody }),
  ah(ctrl.update),
);
r.delete('/variants/:id', auth, requireRole('ADMIN'), validate({ params: idParam }), ah(ctrl.remove));
export default r;
