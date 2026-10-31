import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import type { ListTemplatesQuery } from './template.schema';
import * as svc from './template.service';

export async function list(req: Request, res: Response) {
  res.json(serialize(await svc.listTemplates(req.query as unknown as ListTemplatesQuery)));
}

export async function get(req: Request, res: Response) {
  res.json(serialize(await svc.getTemplate(BigInt(req.params.id))));
}

export async function create(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.createTemplate(req.body)));
}

export async function update(req: Request, res: Response) {
  res.json(serialize(await svc.updateTemplate(BigInt(req.params.id), req.body)));
}

export async function remove(req: Request, res: Response) {
  await svc.deleteTemplate(BigInt(req.params.id));
  res.status(204).end();
}
