import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { outbox } from '../src/lib/mailer';
import { prisma, resetDb } from './helpers/db';
import {
  makeActiveSub, makeAdmin, makeCustomer, makeInvoiceFixture, makeStaff, PASSWORD, tokenFor,
} from './helpers/factories';

const app = createApp();
const api = '/api/v1';
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

const validDiscount = {
  name: 'Loyalty ₹500',
  type: 'FIXED',
  value: '500.00',
  scope: 'SUBSCRIPTION',
  startDate: '2026-11-01',
};

/** "rt=...; Path=/api/v1/auth; HttpOnly; ..." → "rt=..." */
function rtCookie(res: request.Response): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('rt='));
  if (!raw) throw new Error('no rt cookie set');
  return raw.split(';')[0];
}

beforeEach(async () => {
  await resetDb();
  outbox.length = 0;
});
afterAll(() => prisma.$disconnect());

// ---------- the four blueprint tests (section 10) ----------

describe('blueprint tests 17–20', () => {
  it('#17 customer GET another customer\'s invoice → 404', async () => {
    const alice = await makeCustomer();
    const bob = await makeCustomer();
    const bobInvoice = await makeInvoiceFixture(await makeActiveSub(bob.id));

    const asAlice = await request(app).get(`${api}/invoices/${bobInvoice.id}`).set(bearer(await tokenFor(app, alice)));
    expect(asAlice.status).toBe(404);
    expect(asAlice.body.error.code).toBe('NOT_FOUND');

    // same invoice is visible to its owner and to staff
    const asBob = await request(app).get(`${api}/invoices/${bobInvoice.id}`).set(bearer(await tokenFor(app, bob)));
    expect(asBob.status).toBe(200);
    expect(asBob.body).toMatchObject({ id: bobInvoice.id.toString(), total: '1180.00', balanceDue: '1180.00' });
    const staff = await makeStaff();
    const asStaff = await request(app).get(`${api}/invoices/${bobInvoice.id}`).set(bearer(await tokenFor(app, staff)));
    expect(asStaff.status).toBe(200);
  });

  it('#18 staff POST /discounts → 403 (admin → 201)', async () => {
    const staff = await makeStaff();
    const res = await request(app).post(`${api}/discounts`).set(bearer(await tokenFor(app, staff))).send(validDiscount);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(await prisma.discounts.count()).toBe(0);

    const admin = await makeAdmin();
    const ok = await request(app).post(`${api}/discounts`).set(bearer(await tokenFor(app, admin))).send(validDiscount);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ value: '500.00', usedCount: 0, productIds: [], subscriptionIds: [] });
  });

  it('#19 sign-up with "Password1" → 400 with the rule message', async () => {
    const res = await request(app)
      .post(`${api}/auth/signup`)
      .send({ email: 'new@acme.test', password: 'Password1', fullName: 'New Person' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Needs a special character' });
    expect(res.body.error.details.field).toBe('password');
    expect(await prisma.users.count()).toBe(0);
  });

  it('#20 sign-up with the same email in different case → 409 EMAIL_TAKEN', async () => {
    const body = { password: 'Strong@Pass1', fullName: 'Dup Person' };
    const first = await request(app).post(`${api}/auth/signup`).send({ ...body, email: 'Dup@Acme.test' });
    expect(first.status).toBe(201);
    const second = await request(app).post(`${api}/auth/signup`).send({ ...body, email: 'dup@ACME.TEST' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('EMAIL_TAKEN');
    expect(await prisma.users.count()).toBe(1);
  });
});

// ---------- extra coverage for the auth flows (section 8) ----------

describe('sign-up and login', () => {
  it('sign-up always creates a CUSTOMER, even if the body says otherwise', async () => {
    const res = await request(app)
      .post(`${api}/auth/signup`)
      .send({ email: 'sneaky@acme.test', password: 'Strong@Pass1', fullName: 'Sneaky', role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: 'CUSTOMER', email: 'sneaky@acme.test', fullName: 'Sneaky' });
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('unknown email and wrong password get the same 401', async () => {
    await makeCustomer({ email: 'real@acme.test' });
    const wrongPw = await request(app).post(`${api}/auth/login`).send({ email: 'real@acme.test', password: 'Nope@12345' });
    const noUser = await request(app).post(`${api}/auth/login`).send({ email: 'ghost@acme.test', password: 'Nope@12345' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body);
    expect(wrongPw.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('login works with any letter case and sets an httpOnly refresh cookie', async () => {
    await makeCustomer({ email: 'case@acme.test' });
    const res = await request(app).post(`${api}/auth/login`).send({ email: 'CASE@Acme.Test', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'case@acme.test', role: 'CUSTOMER' });
    expect(typeof res.body.accessToken).toBe('string');
    const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('rt='))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('deactivated user → 403', async () => {
    await makeCustomer({ email: 'gone@acme.test', isActive: false });
    const res = await request(app).post(`${api}/auth/login`).send({ email: 'gone@acme.test', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('no token → 401, bad token → 401', async () => {
    expect((await request(app).get(`${api}/me`)).status).toBe(401);
    expect((await request(app).get(`${api}/me`).set(bearer('not-a-jwt'))).status).toBe(401);
  });
});

describe('refresh tokens', () => {
  it('refresh rotates the cookie; reusing the old one revokes every session', async () => {
    await makeCustomer({ email: 'rot@acme.test' });
    const login = await request(app).post(`${api}/auth/login`).send({ email: 'rot@acme.test', password: PASSWORD });
    const first = rtCookie(login);

    const r1 = await request(app).post(`${api}/auth/refresh`).set('Cookie', first);
    expect(r1.status).toBe(200);
    expect(r1.body.user.email).toBe('rot@acme.test');
    const second = rtCookie(r1);
    expect(second).not.toBe(first);

    // the old token again = theft signal
    const reuse = await request(app).post(`${api}/auth/refresh`).set('Cookie', first);
    expect(reuse.status).toBe(401);
    // ...which also killed the newest token
    const afterTheft = await request(app).post(`${api}/auth/refresh`).set('Cookie', second);
    expect(afterTheft.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    await makeCustomer({ email: 'out@acme.test' });
    const login = await request(app).post(`${api}/auth/login`).send({ email: 'out@acme.test', password: PASSWORD });
    const cookie = rtCookie(login);
    expect((await request(app).post(`${api}/auth/logout`).set('Cookie', cookie)).status).toBe(204);
    expect((await request(app).post(`${api}/auth/refresh`).set('Cookie', cookie)).status).toBe(401);
  });
});

describe('password reset', () => {
  it('forgot → emailed link → reset → old password fails, new works, link is single-use', async () => {
    await makeCustomer({ email: 'forgot@acme.test' });
    const login = await request(app).post(`${api}/auth/login`).send({ email: 'forgot@acme.test', password: PASSWORD });

    const f = await request(app).post(`${api}/auth/forgot-password`).send({ email: 'forgot@acme.test' });
    expect(f.status).toBe(200);
    expect(outbox).toHaveLength(1);
    const token = decodeURIComponent(outbox[0].text.match(/token=([^\s]+)/)![1]);

    const reset = await request(app).post(`${api}/auth/reset-password`).send({ token, newPassword: 'Brand@New99' });
    expect(reset.status).toBe(200);

    const oldPw = await request(app).post(`${api}/auth/login`).send({ email: 'forgot@acme.test', password: PASSWORD });
    expect(oldPw.status).toBe(401);
    const newPw = await request(app).post(`${api}/auth/login`).send({ email: 'forgot@acme.test', password: 'Brand@New99' });
    expect(newPw.status).toBe(200);

    // reset revoked the sessions that existed before it
    expect((await request(app).post(`${api}/auth/refresh`).set('Cookie', rtCookie(login))).status).toBe(401);
    // and the link works only once
    const again = await request(app).post(`${api}/auth/reset-password`).send({ token, newPassword: 'Other@Pass99' });
    expect(again.status).toBe(400);
  });

  it('forgot-password for an unknown email still answers 200 and sends nothing', async () => {
    const res = await request(app).post(`${api}/auth/forgot-password`).send({ email: 'nobody@acme.test' });
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(0);
  });

  it('reset enforces the password rule', async () => {
    const res = await request(app).post(`${api}/auth/reset-password`).send({ token: 'x', newPassword: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('roles: users, customers, /me', () => {
  it('only ADMIN creates staff; the new user is STAFF', async () => {
    const staff = await makeStaff();
    const body = { email: 'newstaff@brightloop.test', fullName: 'New Staff', password: 'Staff@12345' };
    expect((await request(app).post(`${api}/users`).set(bearer(await tokenFor(app, staff))).send(body)).status).toBe(403);

    const admin = await makeAdmin();
    const res = await request(app).post(`${api}/users`).set(bearer(await tokenFor(app, admin))).send({ ...body, role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe('STAFF');
    const row = await prisma.users.findUniqueOrThrow({ where: { email: body.email } });
    expect(row.created_by).toBe(admin.id);
  });

  it('admin cannot deactivate their own account', async () => {
    const admin = await makeAdmin();
    const res = await request(app)
      .patch(`${api}/users/${admin.id}`)
      .set(bearer(await tokenFor(app, admin)))
      .send({ isActive: false });
    expect(res.status).toBe(400);
  });

  it('staff manage customers; customers cannot list customers', async () => {
    const staff = await makeStaff();
    const staffToken = await tokenFor(app, staff);
    const created = await request(app)
      .post(`${api}/customers`)
      .set(bearer(staffToken))
      .send({ email: 'ops@acme.in', fullName: 'Acme Ops', companyName: 'Acme' });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('CUSTOMER');
    // no password given → "set your password" email
    expect(outbox[0].to).toBe('ops@acme.in');

    const list = await request(app).get(`${api}/customers?q=acme`).set(bearer(staffToken));
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 25, total: 1 });
    expect(list.body.data[0].email).toBe('ops@acme.in');

    const customer = await makeCustomer();
    expect((await request(app).get(`${api}/customers`).set(bearer(await tokenFor(app, customer)))).status).toBe(403);
  });

  it('/me: read and edit own profile, but never role or email', async () => {
    const customer = await makeCustomer({ email: 'me@acme.test' });
    const token = await tokenFor(app, customer);
    const res = await request(app)
      .patch(`${api}/me`)
      .set(bearer(token))
      .send({ fullName: 'Me Myself', address: '12 MG Road', role: 'ADMIN', email: 'x@y.z' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fullName: 'Me Myself', address: '12 MG Road', role: 'CUSTOMER', email: 'me@acme.test' });
  });

  it('list endpoints reject pageSize over 100', async () => {
    const admin = await makeAdmin();
    const res = await request(app).get(`${api}/users?pageSize=500`).set(bearer(await tokenFor(app, admin)));
    expect(res.status).toBe(400);
  });
});
