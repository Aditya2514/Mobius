import { z } from 'zod';
import { paginationQuery } from '../../lib/pagination';
import { isoDate } from '../../lib/validation';

/** default: the last 12 months, this month included */
export const revenueQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });

export const overdueQuery = paginationQuery;

export type RevenueQuery = z.infer<typeof revenueQuery>;
