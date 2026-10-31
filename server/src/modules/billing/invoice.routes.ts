import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './invoice.controller';

// Phase 1 has only invoice detail; list, confirm, cancel, send and PDF come in Phase 3.
const r = Router();
r.get('/invoices/:id', auth, requireRole('ADMIN', 'STAFF', 'CUSTOMER'), validate({ params: idParam }), ah(ctrl.get));
export default r;
