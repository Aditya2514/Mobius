import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

/**
 * validate({ body, query, params }): parses each part with Zod and replaces it with the
 * parsed (coerced, defaulted) value. A ZodError goes to errorHandler → 400 VALIDATION_ERROR.
 */
export const validate =
  (s: Schemas) =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (s.params) req.params = s.params.parse(req.params) as Request['params'];
      if (s.query) req.query = s.query.parse(req.query) as Request['query'];
      if (s.body) req.body = s.body.parse(req.body);
      next();
    } catch (e) {
      next(e);
    }
  };
