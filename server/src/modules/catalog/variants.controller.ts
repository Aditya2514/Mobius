import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import * as svc from './variants.service';

export async function create(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.addVariant(BigInt(req.params.id), req.body)));
}

export async function update(req: Request, res: Response) {
  res.json(serialize(await svc.updateVariant(BigInt(req.params.id), req.body)));
}

export async function remove(req: Request, res: Response) {
  await svc.deleteVariant(BigInt(req.params.id));
  res.status(204).end();
}
