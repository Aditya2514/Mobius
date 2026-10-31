import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import * as svc from './invoice.service';

export async function get(req: Request, res: Response) {
  res.json(serialize(await svc.getInvoice(BigInt(req.params.id), req.user!)));
}
