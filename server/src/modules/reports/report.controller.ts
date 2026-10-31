import type { Request, Response } from 'express';
import type { PaginationQuery } from '../../lib/pagination';
import { serialize } from '../../lib/serialize';
import type { RevenueQuery } from './report.schema';
import * as svc from './report.service';

export async function summary(_req: Request, res: Response) {
  res.json(serialize(await svc.summary()));
}

export async function revenue(req: Request, res: Response) {
  res.json(serialize(await svc.revenue(req.query as unknown as RevenueQuery)));
}

export async function overdue(req: Request, res: Response) {
  res.json(serialize(await svc.overdue(req.query as unknown as PaginationQuery)));
}

export async function subscriptionsByPlan(_req: Request, res: Response) {
  res.json(serialize(await svc.subscriptionsByPlan()));
}
