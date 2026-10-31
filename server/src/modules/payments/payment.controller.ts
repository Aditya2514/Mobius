import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import type { ListPaymentsQuery } from './payment.schema';
import * as svc from './payment.service';

export async function list(req: Request, res: Response) {
  res.json(serialize(await svc.listPayments(req.query as unknown as ListPaymentsQuery, req.user!)));
}

export async function record(req: Request, res: Response) {
  const payment = await svc.recordPayment(BigInt(req.params.id), req.body, req.user!);
  res.status(201).json(serialize(payment));
}
