import type { Request, Response } from 'express';
import { serialize } from '../../lib/serialize';
import type { ListInvoicesQuery } from './invoice.schema';
import * as svc from './invoice.service';

export async function list(req: Request, res: Response) {
  res.json(serialize(await svc.listInvoices(req.query as unknown as ListInvoicesQuery, req.user!)));
}

export async function get(req: Request, res: Response) {
  res.json(serialize(await svc.getInvoice(BigInt(req.params.id), req.user!)));
}

export async function confirm(req: Request, res: Response) {
  res.json(serialize(await svc.confirmInvoice(BigInt(req.params.id), req.user!)));
}

export async function bulkConfirm(req: Request, res: Response) {
  res.json(serialize(await svc.bulkConfirm(req.body.ids)));
}

export async function cancel(req: Request, res: Response) {
  res.json(serialize(await svc.cancelInvoice(BigInt(req.params.id), req.user!)));
}

export async function print(req: Request, res: Response) {
  res.type('html').send(await svc.invoiceHtml(BigInt(req.params.id), req.user!));
}

export async function pdf(req: Request, res: Response) {
  const { number, pdf } = await svc.invoicePdf(BigInt(req.params.id), req.user!);
  res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${number}.pdf"`);
  res.send(pdf);
}

export async function send(req: Request, res: Response) {
  res.json(serialize(await svc.sendInvoice(BigInt(req.params.id), req.user!)));
}
