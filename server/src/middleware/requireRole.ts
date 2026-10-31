import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import type { Role } from './auth';

/** Use after `auth`: requireRole('ADMIN', 'STAFF') */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Login required'));
    return roles.includes(req.user.role) ? next() : next(new AppError(403, 'FORBIDDEN', 'Not allowed'));
  };
