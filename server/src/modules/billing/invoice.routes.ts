import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './invoice.controller';
import { bulkConfirmBody, listInvoicesQuery } from './invoice.schema';

const ALL = ['ADMIN', 'STAFF', 'CUSTOMER'] as const; // customers are scoped to their own invoices in the service
const TEAM = ['ADMIN', 'STAFF'] as const;

// Invoices are never created here: only the billing engine creates them (AGENTS.md rule 4).
const r = Router();
r.get('/invoices', auth, requireRole(...ALL), validate({ query: listInvoicesQuery }), ah(ctrl.list));
r.post('/invoices/bulk-confirm', auth, requireRole(...TEAM), validate({ body: bulkConfirmBody }), ah(ctrl.bulkConfirm));
r.get('/invoices/:id', auth, requireRole(...ALL), validate({ params: idParam }), ah(ctrl.get));
r.post('/invoices/:id/confirm', auth, requireRole(...TEAM), validate({ params: idParam }), ah(ctrl.confirm));
r.post('/invoices/:id/cancel', auth, requireRole(...TEAM), validate({ params: idParam }), ah(ctrl.cancel));
r.post('/invoices/:id/send', auth, requireRole(...TEAM), validate({ params: idParam }), ah(ctrl.send));
// documents: customers get their own only (scoped in the service, others → 404)
r.get('/invoices/:id/print', auth, requireRole(...ALL), validate({ params: idParam }), ah(ctrl.print));
r.get('/invoices/:id/pdf', auth, requireRole(...ALL), validate({ params: idParam }), ah(ctrl.pdf));
export default r;
