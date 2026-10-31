import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

/** Unknown route → 404 in the contract's error shape. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', `No route ${req.method} ${req.path}`));
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (err instanceof ZodError) {
    const first = err.issues[0];
    return new AppError(400, 'VALIDATION_ERROR', first?.message ?? 'Invalid request', {
      field: first?.path.join('.') || undefined,
      issues: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // unique violation
        return new AppError(409, 'CONFLICT', 'Already exists', { target: err.meta?.target });
      case 'P2003': // foreign key violation
        return new AppError(400, 'VALIDATION_ERROR', 'Referenced record does not exist', {
          field: err.meta?.field_name,
        });
      case 'P2025': // record to update/delete not found
        return new AppError(404, 'NOT_FOUND', 'Not found');
    }
  }

  // malformed JSON body from express.json()
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') return new AppError(400, 'VALIDATION_ERROR', 'Malformed JSON body');
  if (e?.type === 'entity.too.large') return new AppError(400, 'VALIDATION_ERROR', 'Request body too large');

  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
}

/** Every error leaves the API as { error: { code, message, details? } }. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const appErr = toAppError(err);
  if (appErr.status >= 500) (req.log ?? logger).error({ err }, 'unhandled error');
  res.status(appErr.status).json({
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details !== undefined ? { details: appErr.details } : {}),
    },
  });
}
