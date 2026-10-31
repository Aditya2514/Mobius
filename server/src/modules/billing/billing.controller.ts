import type { Request, Response } from 'express';
import type { PaginationQuery } from '../../lib/pagination';
import { serialize } from '../../lib/serialize';
import * as svc from './billing.service';

export async function run(req: Request, res: Response) {
  res.json(serialize(await svc.runNow(req.body?.date, BigInt(req.user!.id))));
}

export async function runs(req: Request, res: Response) {
  res.json(serialize(await svc.listRuns(req.query as unknown as PaginationQuery)));
}

export async function billSubscription(req: Request, res: Response) {
  res.json(serialize(await svc.billSubscriptionNow(BigInt(req.params.id))));
}
