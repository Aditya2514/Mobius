import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './products.controller';
import { createProductBody, listProductsQuery, updateProductBody } from './products.schema';

const READ = ['ADMIN', 'STAFF', 'CUSTOMER'] as const;

const r = Router();
r.get('/products', auth, requireRole(...READ), validate({ query: listProductsQuery }), ah(ctrl.list));
r.post('/products', auth, requireRole('ADMIN'), validate({ body: createProductBody }), ah(ctrl.create));
r.get('/products/:id', auth, requireRole(...READ), validate({ params: idParam }), ah(ctrl.get));
r.patch('/products/:id', auth, requireRole('ADMIN'), validate({ params: idParam, body: updateProductBody }), ah(ctrl.update));
r.delete('/products/:id', auth, requireRole('ADMIN'), validate({ params: idParam }), ah(ctrl.remove));
export default r;
