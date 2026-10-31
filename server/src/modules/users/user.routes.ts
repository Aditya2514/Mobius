import { Router } from 'express';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { idParam } from '../../lib/validation';
import { auth } from '../../middleware/auth';
import { requireRole } from '../../middleware/requireRole';
import { validate } from '../../middleware/validate';
import * as ctrl from './user.controller';
import { createStaffBody, listUsersQuery, updateMeBody, updateUserBody } from './user.schema';

const ANY = ['ADMIN', 'STAFF', 'CUSTOMER'] as const;

const r = Router();
r.get('/me', auth, requireRole(...ANY), ah(ctrl.getMe));
r.patch('/me', auth, requireRole(...ANY), validate({ body: updateMeBody }), ah(ctrl.updateMe));

r.get('/users', auth, requireRole('ADMIN'), validate({ query: listUsersQuery }), ah(ctrl.list));
r.post('/users', auth, requireRole('ADMIN'), validate({ body: createStaffBody }), ah(ctrl.createStaff));
r.patch('/users/:id', auth, requireRole('ADMIN'), validate({ params: idParam, body: updateUserBody }), ah(ctrl.update));
export default r;
