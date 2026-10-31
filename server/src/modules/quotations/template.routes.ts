import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './template.controller';
import { createTemplateBody, listTemplatesQuery, updateTemplateBody } from './template.schema';

// Staff read and use templates (to start subscriptions); only ADMIN changes them. Customers: no access.
const r = Router();
r.get('/quotation-templates', auth, requireRole('ADMIN', 'STAFF'), validate({ query: listTemplatesQuery }), ah(ctrl.list));
r.post('/quotation-templates', auth, requireRole('ADMIN'), validate({ body: createTemplateBody }), ah(ctrl.create));
r.get('/quotation-templates/:id', auth, requireRole('ADMIN', 'STAFF'), validate({ params: idParam }), ah(ctrl.get));
r.patch(
  '/quotation-templates/:id',
  auth,
  requireRole('ADMIN'),
  validate({ params: idParam, body: updateTemplateBody }),
  ah(ctrl.update),
);
r.delete('/quotation-templates/:id', auth, requireRole('ADMIN'), validate({ params: idParam }), ah(ctrl.remove));
export default r;
