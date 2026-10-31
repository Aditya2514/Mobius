import type { Prisma } from '@prisma/client';
import { AppError, notFound, prismaCode } from '../../lib/errors';
import { listResult, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import type { AuthUser } from '../../middleware/auth';
import type { CreateTaxBody, ListTaxesQuery, UpdateTaxBody } from './taxes.schema';

const taxSelect = { id: true, name: true, rate: true, is_active: true, created_at: true } satisfies Prisma.taxesSelect;

const nameTaken = (e: unknown) =>
  prismaCode(e) === 'P2002' ? new AppError(409, 'CONFLICT', 'A tax with this name already exists', { field: 'name' }) : e;

/** Customers only ever see active taxes. */
export async function listTaxes(q: ListTaxesQuery, user: AuthUser) {
  const page = toPage(q, { name: 'name', rate: 'rate', createdAt: 'created_at' }, 'name');
  const active = user.role === 'CUSTOMER' ? true : q.active;
  const where: Prisma.taxesWhereInput = {
    ...(active !== undefined ? { is_active: active } : {}),
    ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
  };
  const [data, total] = await prisma.$transaction([
    prisma.taxes.findMany({ where, select: taxSelect, orderBy: page.orderBy, skip: page.skip, take: page.take }),
    prisma.taxes.count({ where }),
  ]);
  return listResult(data, total, page);
}

export async function createTax(body: CreateTaxBody) {
  try {
    return await prisma.taxes.create({
      data: { name: body.name, rate: body.rate, is_active: body.isActive },
      select: taxSelect,
    });
  } catch (e) {
    throw nameTaken(e);
  }
}

/** Changing a rate affects future invoices only; issued invoice lines keep their snapshot of the rate. */
export async function updateTax(id: bigint, body: UpdateTaxBody) {
  try {
    return await prisma.taxes.update({
      where: { id },
      data: { name: body.name, rate: body.rate, is_active: body.isActive },
      select: taxSelect,
    });
  } catch (e) {
    if (prismaCode(e) === 'P2025') throw notFound('Tax');
    throw nameTaken(e);
  }
}

/** DELETE deactivates: taxes are referenced by products, subscription lines and templates. */
export async function deactivateTax(id: bigint) {
  await updateTax(id, { isActive: false });
}
