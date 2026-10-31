import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';

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
export async function auth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return next(new AppError(401, 'UNAUTHENTICATED', 'Login required'));
  let p: { sub: string };
  try {
    p = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET) as { sub: string };
    BigInt(p.sub);
  } catch {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Session expired'));
  }
  try {
    // live check: deactivated or re-roled users lose access immediately, not at token expiry
    const u = await prisma.users.findUnique({ where: { id: BigInt(p.sub) }, select: { is_active: true, role: true } });
    if (!u || !u.is_active) return next(new AppError(401, 'UNAUTHENTICATED', 'Session expired'));
    req.user = { id: p.sub, role: u.role as Role };
    next();
  } catch (e) {
    next(e);
  }
}

/** Ownership scope for every query a customer can reach. Another customer's row → not found → 404. */
export const ownScope = (user: AuthUser) =>
  user.role === 'CUSTOMER' ? { customer_id: BigInt(user.id) } : {};
