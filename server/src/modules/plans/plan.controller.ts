import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import type { ListPlansQuery } from './plan.schema';
import * as svc from './plan.service';

export async function list(req: Request, res: Response) {
  res.json(serialize(await svc.listPlans(req.query as unknown as ListPlansQuery, req.user!)));
}

export async function get(req: Request, res: Response) {
  res.json(serialize(await svc.getPlan(BigInt(req.params.id), req.user!)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.createPlan(req.body)));
}

export async function update(req: Request, res: Response) {
  res.json(serialize(await svc.updatePlan(BigInt(req.params.id), req.body)));
}
