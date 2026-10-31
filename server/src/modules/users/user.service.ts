import type { Prisma } from '@prisma/client';
import { AppError, notFound } from '../../lib/errors';
import { listResult, toPage } from '../../lib/pagination';
import { prisma } from '../../lib/prisma';
import { hashPassword, mapEmailTaken, revokeAllSessions } from '../auth/auth.service';
import { publicUserSelect, userSearch, userSortable, type PublicUser } from './user.select';
import type { CreateStaffBody, ListUsersQuery, UpdateMeBody, UpdateUserBody } from './user.schema';

// ---------- /me ----------

export async function getMe(userId: bigint): Promise<PublicUser> {
  const user = await prisma.users.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw notFound('User');
  return user;
}

export async function updateMe(userId: bigint, body: UpdateMeBody): Promise<PublicUser> {
  return prisma.users.update({
    where: { id: userId },
    data: {
      full_name: body.fullName,
      company_name: body.companyName,
      phone: body.phone,
      address: body.address,
      gstin: body.gstin,
      updated_at: new Date(),
    },
    select: publicUserSelect,
  });
}

// ---------- /users (admin) ----------

export async function listUsers(q: ListUsersQuery) {
  const page = toPage(q, userSortable, '-createdAt');
  const where: Prisma.usersWhereInput = { ...(q.role ? { role: q.role } : {}), ...userSearch(q.q) };
  const [data, total] = await prisma.$transaction([
    prisma.users.findMany({ where, select: publicUserSelect, orderBy: page.orderBy, skip: page.skip, take: page.take }),
    prisma.users.count({ where }),
  ]);
  return listResult(data, total, page);
}

export async function createStaff(body: CreateStaffBody, adminId: bigint): Promise<PublicUser> {
  try {
    return await prisma.users.create({
      data: {
        email: body.email,
        password_hash: await hashPassword(body.password),
        full_name: body.fullName,
        phone: body.phone ?? null,
        role: 'STAFF',
        created_by: adminId,
      },
      select: publicUserSelect,
    });
  } catch (e) {
    throw mapEmailTaken(e);
  }
}

export async function updateUser(id: bigint, body: UpdateUserBody, adminId: bigint): Promise<PublicUser> {
  if (id === adminId && body.isActive === false) {
    throw new AppError(400, 'BUSINESS_RULE', 'You cannot deactivate your own account');
  }
  return prisma.$transaction(async (tx) => {
    const exists = await tx.users.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound('User');
    const user = await tx.users.update({
      where: { id },
      data: { full_name: body.fullName, phone: body.phone, is_active: body.isActive, updated_at: new Date() },
      select: publicUserSelect,
    });
    if (body.isActive === false) await revokeAllSessions(id, tx); // log them out everywhere
    return user;
  });
}
