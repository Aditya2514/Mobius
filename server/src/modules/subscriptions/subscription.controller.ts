import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import type { ListSubscriptionsQuery } from './subscription.schema';
import * as svc from './subscription.service';

const id = (req: Request) => BigInt(req.params.id);

export async function list(req: Request, res: Response) {
  res.json(serialize(await svc.listSubscriptions(req.query as unknown as ListSubscriptionsQuery, req.user!)));
}

export async function get(req: Request, res: Response) {
  res.json(serialize(await svc.getSubscription(id(req), req.user!)));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.createSubscription(req.body, req.user!)));
}

export async function update(req: Request, res: Response) {
  res.json(serialize(await svc.updateSubscription(id(req), req.body, req.user!)));
}

export async function addLine(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.addLine(id(req), req.body, req.user!)));
}

export async function updateLine(req: Request, res: Response) {
  res.json(serialize(await svc.updateLine(id(req), BigInt(req.params.lineId), req.body, req.user!)));
}

export async function deleteLine(req: Request, res: Response) {
  res.json(serialize(await svc.deleteLine(id(req), BigInt(req.params.lineId), req.user!)));
}

export async function transition(req: Request, res: Response) {
  res.json(serialize(await svc.transition(id(req), req.body.action, req.user!)));
}

export async function history(req: Request, res: Response) {
  res.json(serialize(await svc.getHistory(id(req), req.query as unknown as { page: number; pageSize: number; sort?: string })));
}
