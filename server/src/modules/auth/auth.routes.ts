import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env, isTest } from '../../config/env';
import { asyncHandler as ah } from '../../lib/asyncHandler';
import { AppError } from '../../lib/errors';
import { validate } from '../../middleware/validate';
import * as ctrl from './auth.controller';
import { forgotPasswordBody, loginBody, resetPasswordBody, signupBody } from './auth.schema';

// requests per minute per IP, counted separately for each endpoint attackers like to hammer
const perMinute = (limit: number) => rateLimit({
  windowMs: 60_000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => isTest,
  handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many attempts, try again in a minute')),
});

// Public by design: these are how a user gets a session in the first place.
const r = Router();
r.post('/auth/signup', validate({ body: signupBody }), ah(ctrl.signup));
r.post('/auth/login', perMinute(env.AUTH_RATE_LIMIT), validate({ body: loginBody }), ah(ctrl.login));
r.post('/auth/refresh', ah(ctrl.refresh)); // authenticated by the httpOnly rt cookie
r.post('/auth/logout', ah(ctrl.logout)); // revokes only the cookie's own token
r.post('/auth/forgot-password', perMinute(env.AUTH_RATE_LIMIT), validate({ body: forgotPasswordBody }), ah(ctrl.forgotPassword));
r.post('/auth/reset-password', perMinute(env.AUTH_RATE_LIMIT), validate({ body: resetPasswordBody }), ah(ctrl.resetPassword));
export default r;
