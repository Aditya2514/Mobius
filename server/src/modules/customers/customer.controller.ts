import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import type { ListCustomersQuery } from './customer.schema';
import * as svc from './customer.service';

export async function list(req: Request, res: Response) {
  res.json(serialize(await svc.listCustomers(req.query as unknown as ListCustomersQuery)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.createCustomer(req.body, BigInt(req.user!.id))));
}

export async function get(req: Request, res: Response) {
  res.json(serialize(await svc.getCustomer(BigInt(req.params.id))));
}

export async function update(req: Request, res: Response) {
  res.json(serialize(await svc.updateCustomer(BigInt(req.params.id), req.body)));
}
