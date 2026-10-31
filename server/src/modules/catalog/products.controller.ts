import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import type { ListProductsQuery } from './products.schema';
import * as svc from './products.service';

export async function list(req: Request, res: Response) {
  res.json(serialize(await svc.listProducts(req.query as unknown as ListProductsQuery, req.user!)));
}

export async function get(req: Request, res: Response) {
  res.json(serialize(await svc.getProduct(BigInt(req.params.id), req.user!)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.createProduct(req.body)));
}

export async function update(req: Request, res: Response) {
  res.json(serialize(await svc.updateProduct(BigInt(req.params.id), req.body)));
}

export async function remove(req: Request, res: Response) {
  await svc.deactivateProduct(BigInt(req.params.id));
  res.status(204).end();
}
