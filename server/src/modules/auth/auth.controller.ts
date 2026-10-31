import type { CookieOptions, Request, Response } from 'express';
import { env, isProd } from '../../config/env';
import { serialize } from '../../lib/serialize';
import * as svc from './auth.service';

const RT_COOKIE = 'rt';
const rtCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: isProd,
  path: '/api/v1/auth',
};

function sendSession(res: Response, s: svc.Session, status = 200) {
  res.cookie(RT_COOKIE, s.refreshToken, { ...rtCookieOptions, maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000 });
  res.status(status).json(serialize({ accessToken: s.accessToken, user: s.user }));
}

export async function signup(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.signup(req.body)));
}

export async function login(req: Request, res: Response) {
  sendSession(res, await svc.login(req.body));
}

export async function refresh(req: Request, res: Response) {
  try {
    sendSession(res, await svc.refresh(req.cookies?.[RT_COOKIE]));
  } catch (e) {
    res.clearCookie(RT_COOKIE, rtCookieOptions);
    throw e;
  }
}

export async function logout(req: Request, res: Response) {
  await svc.logout(req.cookies?.[RT_COOKIE]);
  res.clearCookie(RT_COOKIE, rtCookieOptions);
  res.status(204).end();
}

export async function forgotPassword(req: Request, res: Response) {
  await svc.forgotPassword(req.body.email);
  res.json({ message: 'If that email is registered, a reset link is on its way.' });
}

export async function resetPassword(req: Request, res: Response) {
  await svc.resetPassword(req.body.token, req.body.newPassword);
  res.json({ message: 'Password updated. You can log in now.' });
}
