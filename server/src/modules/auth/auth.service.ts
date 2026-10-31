import { Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mailer';
import { prisma } from '../../lib/prisma';
import type { Role } from '../../middleware/auth';
import { publicUserSelect, type PublicUser } from '../users/user.select';
import type { LoginBody, SignupBody } from './auth.schema';

const BCRYPT_COST = 12;
const RESET_TOKEN_MINUTES = 30;
// compared against when the email is unknown, so both failures take the same time
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newRawToken = () => randomBytes(32).toString('base64url');

export type Session = { accessToken: string; refreshToken: string; user: PublicUser };

// ---------- sign-up / login ----------

export async function signup(body: SignupBody): Promise<PublicUser> {
  try {
    return await prisma.users.create({
      data: {
        email: body.email,
        password_hash: await hashPassword(body.password),
        full_name: body.fullName,
        company_name: body.companyName ?? null,
        role: 'CUSTOMER', // never from the request body
      },
      select: publicUserSelect,
    });
  } catch (e) {
    throw mapEmailTaken(e);
  }
}

/** P2002 on users.email (CITEXT UNIQUE) → 409 EMAIL_TAKEN */
export function mapEmailTaken(e: unknown): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new AppError(409, 'EMAIL_TAKEN', 'Email already registered', { field: 'email' });
  }
  return e;
}

export async function login(body: LoginBody): Promise<Session> {
  const user = await prisma.users.findUnique({ where: { email: body.email } });
  const ok = await bcrypt.compare(body.password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  if (!user.is_active) throw new AppError(403, 'FORBIDDEN', 'This account has been deactivated');
  return issueSession(user.id, user.role);
}

// ---------- tokens ----------

async function issueSession(userId: bigint, role: Role, tx: Prisma.TransactionClient = prisma): Promise<Session> {
  const accessToken = jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
    subject: userId.toString(),
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
  const refreshToken = newRawToken();
  await tx.refresh_tokens.create({
    data: {
      user_id: userId,
      token_hash: sha256(refreshToken),
      expires_at: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000),
    },
  });
  const user = await tx.users.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
  return { accessToken, refreshToken, user };
}

const sessionExpired = () => new AppError(401, 'UNAUTHENTICATED', 'Session expired, please log in again');

/** Rotate: the presented refresh token is revoked and a new pair issued. Reuse of a revoked token revokes everything. */
export async function refresh(rawToken: string | undefined): Promise<Session> {
  if (!rawToken) throw sessionExpired();
  const tokenHash = sha256(rawToken);

  const outcome = await prisma.$transaction(async (tx) => {
    const row = await tx.refresh_tokens.findUnique({ where: { token_hash: tokenHash }, include: { users: true } });
    if (!row) return { error: sessionExpired() };

    // atomic claim: only one request can revoke an active token
    const claimed = await tx.refresh_tokens.updateMany({
      where: { id: row.id, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    if (claimed.count === 0) {
      // already revoked token presented again = likely stolen: end every session of this user
      await tx.refresh_tokens.updateMany({
        where: { user_id: row.user_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      logger.warn({ userId: row.user_id.toString() }, 'revoked refresh token reused; all sessions revoked');
      return { error: sessionExpired() };
    }
    if (row.expires_at <= new Date() || !row.users.is_active) return { error: sessionExpired() };
    return { session: await issueSession(row.user_id, row.users.role, tx) };
  });

  // throw after the transaction so the revocations above are committed
  if ('error' in outcome) throw outcome.error;
  return outcome.session;
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await prisma.refresh_tokens.updateMany({
    where: { token_hash: sha256(rawToken), revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export async function revokeAllSessions(userId: bigint, tx: Prisma.TransactionClient = prisma) {
  await tx.refresh_tokens.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: new Date() } });
}

// ---------- password reset ----------

/** Creates a single-use reset token and emails the link. Also used for "set your password" on new accounts. */
export async function sendPasswordLink(
  user: { id: bigint; email: string; full_name: string },
  purpose: 'reset' | 'welcome' = 'reset',
) {
  const raw = newRawToken();
  await prisma.password_reset_tokens.create({
    data: {
      user_id: user.id,
      token_hash: sha256(raw),
      expires_at: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
    },
  });
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(raw)}`;
  const intro =
    purpose === 'welcome'
      ? 'An account has been created for you at Brightloop. Set your password here:'
      : 'We received a request to reset your Brightloop password. Set a new one here:';
  await sendMail({
    to: user.email,
    subject: purpose === 'welcome' ? 'Set your Brightloop password' : 'Reset your Brightloop password',
    text: `Hi ${user.full_name},\n\n${intro}\n${link}\n\nThe link expires in ${RESET_TOKEN_MINUTES} minutes. If you didn't ask for this, ignore this email.`,
  });
}

/** Always succeeds from the caller's point of view, so it never reveals which emails exist. */
export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.users.findUnique({ where: { email } });
  if (!user || !user.is_active) return;
  try {
    await sendPasswordLink(user);
  } catch (err) {
    logger.error({ err }, 'failed to send password reset email');
  }
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    // atomic: an unused, unexpired token can be used exactly once
    const row = await tx.password_reset_tokens.findUnique({ where: { token_hash: tokenHash } });
    const used = row
      ? await tx.password_reset_tokens.updateMany({
          where: { id: row.id, used_at: null, expires_at: { gt: new Date() } },
          data: { used_at: new Date() },
        })
      : { count: 0 };
    if (!row || used.count === 0) {
      throw new AppError(400, 'BUSINESS_RULE', 'This reset link is invalid or has expired');
    }
    await tx.users.update({ where: { id: row.user_id }, data: { password_hash: passwordHash, updated_at: new Date() } });
    await revokeAllSessions(row.user_id, tx);
  });
}
