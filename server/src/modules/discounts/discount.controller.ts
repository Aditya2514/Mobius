import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import type { ListDiscountsQuery } from './discount.schema';
import * as svc from './discount.service';

export async function list(req: Request, res: Response) {
  res.json(serialize(await svc.listDiscounts(req.query as unknown as ListDiscountsQuery)));
}

export async function get(req: Request, res: Response) {
  res.json(serialize(await svc.getDiscount(BigInt(req.params.id))));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.createDiscount(req.body, BigInt(req.user!.id))));
}

export async function update(req: Request, res: Response) {
  res.json(serialize(await svc.updateDiscount(BigInt(req.params.id), req.body)));
}
