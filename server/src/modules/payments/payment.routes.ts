import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './payment.controller';
import { listPaymentsQuery, recordPaymentBody } from './payment.schema';

const r = Router();
r.get('/payments', auth, requireRole('ADMIN', 'STAFF', 'CUSTOMER'), validate({ query: listPaymentsQuery }), ah(ctrl.list));
r.post('/invoices/:id/payments', auth, requireRole('ADMIN', 'STAFF'),
       validate({ params: idParam, body: recordPaymentBody }), ah(ctrl.record));
export default r;
