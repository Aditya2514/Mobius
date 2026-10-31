import { api } from '../api/client';

/** Escape text before it goes into the print document (names, references, etc. are user-supplied). */
const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Exports or prints that specific invoice as a standalone formal document.
 * Tries the server GET /invoices/:id/pdf first.
 * If running with mocks or server PDF service is unavailable, it renders
 * an isolated, perfectly formatted A4 Tax Invoice document in a print frame.
 */
export async function exportInvoicePdf(invoice) {
  try {
    const res = await api.get(`/invoices/${invoice.id}/pdf`, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const fileUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = `${invoice.number || 'Invoice'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(fileUrl), 5000);
  } catch {
    // Fallback to standalone isolated invoice print
    printStandaloneInvoice(invoice);
  }
}

/**
 * Generates an isolated HTML document containing ONLY this particular invoice,
 * completely excluding the app sidebar, topbar, buttons, or page wrapper.
 */
export function printStandaloneInvoice(invoice) {
  const printWindow = window.open('', '_blank', 'width=850,height=1000');
  if (!printWindow) {
    alert('Please allow popups to print the invoice.');
    return;
  }

  const inr = (v) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(v || 0));

  const linesHtml = (invoice.lines || [])
    .map(
      (line, i) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${i + 1}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
          <strong>${esc(line.description || 'Service')}</strong>
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${esc(line.quantity)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${inr(line.unitPrice)}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #7c3aed;">
          ${Number(line.discountAmount) > 0 ? `-${inr(line.discountAmount)}` : '—'}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">
          ${line.taxAmount ? inr(line.taxAmount) : '—'}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600;">
          ${inr(line.lineTotal)}
        </td>
      </tr>
    `
    )
    .join('');

  const paymentsHtml = (invoice.payments || []).length
    ? `
      <div style="margin-top: 30px;">
        <h3 style="font-size: 13px; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 8px;">Settlement Receipts</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
              <th style="padding: 8px; text-align: left;">Date</th>
              <th style="padding: 8px; text-align: left;">Payment Method</th>
              <th style="padding: 8px; text-align: left;">Reference / UTR</th>
              <th style="padding: 8px; text-align: right;">Amount Paid</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.payments
              .map(
                (p) => `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${esc(p.paidOn)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${esc(p.method)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${esc(p.reference || '—')}</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 600; color: #16a34a;">${inr(p.amount)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `
    : '';

  const docHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${esc(invoice.number)} - Tax Invoice</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 24px;
            font-size: 13px;
            line-height: 1.5;
            background: #ffffff;
          }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
          .logo { font-size: 22px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px; }
          .badge {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 9999px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .badge-PAID { background: #dcfce7; color: #166534; }
          .badge-CONFIRMED { background: #f3e8ff; color: #6b21a8; }
          .badge-DRAFT { background: #f1f5f9; color: #475569; }
          .badge-CANCELLED { background: #f1f5f9; color: #94a3b8; }
          .badge-OVERDUE { background: #fee2e2; color: #991b1b; }
          .grid { display: flex; justify-content: space-between; margin-bottom: 28px; gap: 20px; }
          .card { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
          th { background: #f8fafc; padding: 10px; font-weight: 700; color: #475569; border-bottom: 2px solid #cbd5e1; text-align: left; }
          .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 20px; }
          .totals-table { width: 300px; }
          .totals-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px; }
          .totals-row.final { border-top: 2px solid #e2e8f0; border-bottom: 2px solid #e2e8f0; padding: 8px 0; font-weight: 800; font-size: 15px; }
          .totals-row.balance { padding: 8px 0; font-weight: 800; font-size: 16px; color: ${Number(invoice.balanceDue) > 0 ? '#dc2626' : '#16a34a'}; }
          .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #64748b; text-align: center; }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">Brightloop Software</div>
            <div style="color: #64748b; font-size: 12px; margin-top: 2px;">Subscription & Cloud Services</div>
            <div style="color: #64748b; font-size: 12px;">Infopark Phase II, Kochi, Kerala, India 682042</div>
            <div style="color: #64748b; font-size: 12px;">GSTIN: 32AABCB9999Z1Z8 • billing@brightloop.test</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">TAX INVOICE</div>
            <div style="font-size: 15px; font-weight: 700; color: #4f46e5; margin-bottom: 6px;">${esc(invoice.number)}</div>
            <div class="badge badge-${invoice.isOverdue ? 'OVERDUE' : esc(invoice.status)}">${invoice.isOverdue ? 'OVERDUE' : esc(invoice.status)}</div>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Billed To</div>
            <div style="font-weight: 700; font-size: 14px;">${esc(invoice.billTo?.name || 'Customer')}</div>
            <div style="color: #475569;">${esc(invoice.billTo?.email || '')}</div>
            ${invoice.billTo?.address ? `<div style="color: #64748b; font-size: 12px; margin-top: 4px;">${esc(invoice.billTo.address)}</div>` : ''}
          </div>
          <div class="card">
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px;">Invoice Summary</div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span style="color: #64748b;">Invoice Date:</span>
              <strong>${esc(invoice.invoiceDate)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span style="color: #64748b;">Due Date:</span>
              <strong style="${invoice.isOverdue ? 'color: #dc2626;' : ''}">${esc(invoice.dueDate)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
              <span style="color: #64748b;">Agreement:</span>
              <span>${esc(invoice.subscriptionNumber || '')}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: #64748b;">Billing Period:</span>
              <span>${esc(invoice.periodStart || '')} — ${esc(invoice.periodEnd || '')}</span>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">#</th>
              <th>Description</th>
              <th style="width: 50px; text-align: center;">Qty</th>
              <th style="width: 100px; text-align: right;">Unit Price</th>
              <th style="width: 90px; text-align: right;">Discount</th>
              <th style="width: 90px; text-align: right;">GST Tax</th>
              <th style="width: 110px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>

        <div class="totals-wrap">
          <div class="totals-table">
            <div class="totals-row">
              <span style="color: #64748b;">Subtotal:</span>
              <strong>${inr(invoice.subtotal)}</strong>
            </div>
            <div class="totals-row">
              <span style="color: #64748b;">Promotional Discount:</span>
              <strong style="color: #7c3aed;">-${inr(invoice.discountTotal)}</strong>
            </div>
            <div class="totals-row">
              <span style="color: #64748b;">GST Tax:</span>
              <strong>+${inr(invoice.taxTotal)}</strong>
            </div>
            <div class="totals-row final">
              <span>Total Invoice Amount:</span>
              <span>${inr(invoice.total)}</span>
            </div>
            <div class="totals-row">
              <span style="color: #64748b;">Total Paid:</span>
              <strong style="color: #16a34a;">${inr(invoice.amountPaid)}</strong>
            </div>
            <div class="totals-row balance">
              <span>Balance Due:</span>
              <span>${inr(invoice.balanceDue)}</span>
            </div>
          </div>
        </div>

        ${paymentsHtml}

        <div class="footer">
          <div>This is a computer-generated tax invoice issued by Brightloop Software Pvt. Ltd.</div>
          <div>All terms and conditions of subscription agreement apply. For billing support, email billing@brightloop.test.</div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(docHtml);
  printWindow.document.close();
}

