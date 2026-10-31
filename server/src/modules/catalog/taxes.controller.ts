import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import type { ListTaxesQuery } from './taxes.schema';
import * as svc from './taxes.service';

export async function list(req: Request, res: Response) {
  res.json(serialize(await svc.listTaxes(req.query as unknown as ListTaxesQuery, req.user!)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.createTax(req.body)));
}

export async function update(req: Request, res: Response) {
  res.json(serialize(await svc.updateTax(BigInt(req.params.id), req.body)));
}

export async function remove(req: Request, res: Response) {
  await svc.deactivateTax(BigInt(req.params.id));
  res.status(204).end();
}
