import type { Prisma } from '@prisma/client';

/** The only user columns that ever leave the API (never password_hash). */
export const publicUserSelect = {
  id: true,
  email: true,
  full_name: true,
  role: true,
  company_name: true,
  phone: true,
  address: true,
  gstin: true,
  is_active: true,
  created_at: true,
} satisfies Prisma.usersSelect;

export type PublicUser = Prisma.usersGetPayload<{ select: typeof publicUserSelect }>;

export const userSortable = { createdAt: 'created_at', fullName: 'full_name', email: 'email', companyName: 'company_name' };

/** name / email / company contains q, case-insensitive */
export const userSearch = (q?: string): Prisma.usersWhereInput =>
  q
    ? {
        OR: [
          { full_name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { company_name: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};
