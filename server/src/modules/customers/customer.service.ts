import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { listResult, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { hashPassword, mapEmailTaken, revokeAllSessions, sendPasswordLink } from '../auth/auth.service';
import { publicUserSelect, userSearch, userSortable, type PublicUser } from '../users/user.select';
import type { CreateCustomerBody, ListCustomersQuery, UpdateCustomerBody } from './customer.schema';

export async function listCustomers(q: ListCustomersQuery) {
  const page = toPage(q, userSortable, '-createdAt');
  const where: Prisma.usersWhereInput = {
    role: 'CUSTOMER',
    ...(q.active !== undefined ? { is_active: q.active } : {}),
    ...userSearch(q.q),
  };
  const [data, total] = await prisma.$transaction([
    prisma.users.findMany({ where, select: publicUserSelect, orderBy: page.orderBy, skip: page.skip, take: page.take }),
    prisma.users.count({ where }),
  ]);
  return listResult(data, total, page);
}

export async function createCustomer(body: CreateCustomerBody, actorId: bigint): Promise<PublicUser> {
  // no password given → unguessable placeholder; the customer sets a real one from the emailed link
  const password = body.password ?? randomBytes(32).toString('base64url');
  let customer: PublicUser;
  try {
    customer = await prisma.users.create({
      data: {
        email: body.email,
        password_hash: await hashPassword(password),
        full_name: body.fullName,
        company_name: body.companyName ?? null,
        phone: body.phone ?? null,
        address: body.address ?? null,
        gstin: body.gstin ?? null,
        role: 'CUSTOMER',
        created_by: actorId,
      },
      select: publicUserSelect,
    });
  } catch (e) {
    throw mapEmailTaken(e);
  }
  if (!body.password) {
    await sendPasswordLink(customer, 'welcome').catch((err) =>
      logger.error({ err, customerId: customer.id.toString() }, 'failed to send welcome email'),
    );
  }
  return customer;
}

export async function getCustomer(id: bigint): Promise<PublicUser> {
  const customer = await prisma.users.findFirst({ where: { id, role: 'CUSTOMER' }, select: publicUserSelect });
  if (!customer) throw notFound('Customer');
  return customer;
}

export async function updateCustomer(id: bigint, body: UpdateCustomerBody): Promise<PublicUser> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.users.findFirst({ where: { id, role: 'CUSTOMER' }, select: { id: true } });
    if (!found) throw notFound('Customer');
    const customer = await tx.users.update({
      where: { id },
      data: {
        full_name: body.fullName,
        company_name: body.companyName,
        phone: body.phone,
        address: body.address,
        gstin: body.gstin,
        is_active: body.isActive,
        updated_at: new Date(),
      },
      select: publicUserSelect,
    });
    if (body.isActive === false) await revokeAllSessions(id, tx);
    return customer;
  });
}
