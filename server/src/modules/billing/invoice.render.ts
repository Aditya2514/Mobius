import { readFileSync } from 'node:fs';
import path from 'node:path';
import { serialize } from '../../lib/serialize';

/** Seller details printed on every invoice. */
export const COMPANY = {
  name: 'Brightloop Software Pvt Ltd',
  address: '3rd Floor, Indiranagar 100 Ft Road, Bengaluru 560038',
  gstin: '29AACCB1234K1Z9',
  email: 'billing@brightloop.test',
};

type InvoiceJson = {
  number: string; subscriptionNumber: string; status: string; isOverdue: boolean;
  periodStart: string; periodEnd: string; invoiceDate: string; dueDate: string;
  billTo: { name: string; email: string; address: string | null };
  subtotal: string; discountTotal: string; taxTotal: string; total: string; amountPaid: string; balanceDue: string;
  lines: { description: string; quantity: number; unitPrice: string; lineSubtotal: string; discountAmount: string;
           taxName: string | null; taxRate: string; taxAmount: string; lineTotal: string }[];
  payments: { method: string; amount: string; paidOn: string; reference: string | null }[];
};

let template: string | undefined;
/** read once; `npm run build` copies the file next to the compiled code */
const loadTemplate = () => (template ??= readFileSync(path.join(__dirname, 'invoice.template.html'), 'utf8'));

const escape = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// money arrives as exact decimal strings ("8283.60"); Intl formats a decimal string exactly, no float maths
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
export const money = (s: string) => inr.format(s as unknown as number);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-11-01" → "1 Nov 2026" */
export const day = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
};

/** period end is exclusive, so print the last day of service; a one-day period prints one date */
function servicePeriod(start: string, endExclusive: string) {
  const last = new Date(Date.parse(`${endExclusive}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return last === start ? day(start) : `${day(start)} to ${day(last)}`;
}

const METHOD: Record<string, string> = {
  CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', UPI: 'UPI', CARD: 'Card', CHEQUE: 'Cheque', OTHER: 'Other',
};

/** Invoice detail (as returned by getInvoice) → standalone HTML page. */
export function renderInvoiceHtml(detail: unknown): string {
  const inv = serialize<InvoiceJson>(detail);
  const statusLabel = inv.isOverdue ? 'Overdue' : inv.status.charAt(0) + inv.status.slice(1).toLowerCase();

  const lineRows = inv.lines
    .map(
      (l) => `<tr>
        <td>${escape(l.description)}</td>
        <td class="num">${escape(l.quantity)}</td>
        <td class="num">${money(l.unitPrice)}</td>
        <td class="num">${money(l.lineSubtotal)}</td>
        <td class="num">${l.discountAmount === '0.00' ? '—' : `− ${money(l.discountAmount)}`}</td>
        <td class="num">${money(l.taxAmount)}<br><span class="muted small">${escape(l.taxName ?? 'No tax')}${l.taxName ? ` (${escape(l.taxRate)}%)` : ''}</span></td>
        <td class="num">${money(l.lineTotal)}</td>
      </tr>`,
    )
    .join('\n');

  const paymentsBlock = inv.payments.length
    ? `<table class="small">${inv.payments
        .map(
          (p) => `<tr><td>${day(p.paidOn)}</td><td>${escape(METHOD[p.method] ?? p.method)}</td>
            <td class="muted">${escape(p.reference ?? '')}</td><td class="num">${money(p.amount)}</td></tr>`,
        )
        .join('')}</table>`
    : '<div class="muted small">No payments yet.</div>';

  const values: Record<string, string> = {
    companyName: escape(COMPANY.name),
    companyAddress: escape(COMPANY.address),
    companyGstin: escape(COMPANY.gstin),
    companyEmail: escape(COMPANY.email),
    number: escape(inv.number),
    subscriptionNumber: escape(inv.subscriptionNumber),
    status: inv.isOverdue ? 'OVERDUE' : escape(inv.status),
    statusLabel: escape(statusLabel),
    invoiceDate: day(inv.invoiceDate),
    dueDate: day(inv.dueDate),
    servicePeriod: servicePeriod(inv.periodStart, inv.periodEnd),
    billToName: escape(inv.billTo.name),
    billToEmail: escape(inv.billTo.email),
    billToAddress: escape(inv.billTo.address ?? ''),
    subtotal: money(inv.subtotal),
    discountTotal: money(inv.discountTotal),
    taxTotal: money(inv.taxTotal),
    total: money(inv.total),
    amountPaid: money(inv.amountPaid),
    balanceDue: money(inv.balanceDue),
    // already-safe HTML fragments (triple braces)
    lineRows,
    paymentsBlock,
    overdueStamp: inv.isOverdue ? '<div class="stamp">OVERDUE</div>' : '',
  };
  return loadTemplate().replace(/\{\{\{?(\w+)\}?\}\}/g, (_, key: string) => values[key] ?? '');
}
