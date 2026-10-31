import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

export type Role = 'ADMIN' | 'STAFF' | 'CUSTOMER';
export type AuthUser = { id: string; role: Role };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Verify the access JWT from "Authorization: Bearer <token>" and set req.user = { id, role }. */
export function auth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new AppError(401, 'UNAUTHENTICATED', 'Login required'));
  try {
    const p = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET) as { sub: string; role: Role };
    req.user = { id: p.sub, role: p.role };
    next();
  } catch {
    next(new AppError(401, 'UNAUTHENTICATED', 'Session expired'));
  }
}

/** Ownership scope for every query a customer can reach. Another customer's row → not found → 404. */
export const ownScope = (user: AuthUser) =>
  user.role === 'CUSTOMER' ? { customer_id: BigInt(user.id) } : {};
