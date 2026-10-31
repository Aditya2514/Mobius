import { z } from 'zod';
import { AppError } from './errors';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Merge this into every list endpoint's query schema. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sort: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export type Page = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  orderBy: Record<string, 'asc' | 'desc'>;
};

/**
 * ?page&pageSize&sort → Prisma { skip, take, orderBy }.
 * `sortable` maps API field names (camelCase) to columns, e.g. { createdAt: 'created_at' }.
 * sort=field is ascending, sort=-field is descending. Unknown fields are a 400.
 */
export function toPage(q: PaginationQuery, sortable: Record<string, string>, defaultSort: string): Page {
  const raw = q.sort ?? defaultSort;
  const desc = raw.startsWith('-');
  const field = desc ? raw.slice(1) : raw;
  const column = sortable[field];
  if (!column) {
    throw new AppError(400, 'VALIDATION_ERROR', `Cannot sort by "${field}"`, {
      field: 'sort',
      allowed: Object.keys(sortable),
    });
  }
  return {
    page: q.page,
    pageSize: q.pageSize,
    skip: (q.page - 1) * q.pageSize,
    take: q.pageSize,
    orderBy: { [column]: desc ? 'desc' : 'asc' },
  };
}

/** The list envelope every list endpoint returns. */
export const listResult = <T>(data: T[], total: number, p: Pick<Page, 'page' | 'pageSize'>) => ({
  data,
  page: p.page,
  pageSize: p.pageSize,
  total,
});
