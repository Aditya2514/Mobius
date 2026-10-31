import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import type { ListUsersQuery } from './user.schema';
import * as svc from './user.service';

export async function getMe(req: Request, res: Response) {
  res.json(serialize(await svc.getMe(BigInt(req.user!.id))));
}

export async function updateMe(req: Request, res: Response) {
  res.json(serialize(await svc.updateMe(BigInt(req.user!.id), req.body)));
}

export async function list(req: Request, res: Response) {
  res.json(serialize(await svc.listUsers(req.query as unknown as ListUsersQuery)));
}

export async function createStaff(req: Request, res: Response) {
  res.status(201).json(serialize(await svc.createStaff(req.body, BigInt(req.user!.id))));
}

export async function update(req: Request, res: Response) {
  res.json(serialize(await svc.updateUser(BigInt(req.params.id), req.body, BigInt(req.user!.id))));
}
