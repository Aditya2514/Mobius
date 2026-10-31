import dayjs from 'dayjs';

export function formatDate(val, fmt = 'DD MMM YYYY') {
  if (!val) return '—';
  return dayjs(val).format(fmt);
}

export function formatDateTime(val, fmt = 'DD MMM YYYY, HH:mm') {
  if (!val) return '—';
  return dayjs(val).format(fmt);
}

export function titleCase(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}


const inrFull = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const inrWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const plainIn = new Intl.NumberFormat('en-IN');

/** "₹12,34,567.00": display only, the API sends exact strings and the client never calculates money. */
export function formatMoney(val) {
  if (val === null || val === undefined || val === '' || Number.isNaN(Number(val))) return '—';
  return inrFull.format(Number(val));
}

/** Short form for tight spaces: ₹5.13 Cr, ₹88.06 L, ₹12,852. Use with the full value as a tooltip. */
export function formatMoneyCompact(val, digits = 2) {
  if (val === null || val === undefined || val === '' || Number.isNaN(Number(val))) return '—';
  const n = Number(val);
  const abs = Math.abs(n);
  const trim = (x) => x.toFixed(digits).replace(/\.?0+$/, '');
  if (abs >= 1e7) return `${n < 0 ? '-' : ''}₹${trim(abs / 1e7)} Cr`;
  if (abs >= 1e5) return `${n < 0 ? '-' : ''}₹${trim(abs / 1e5)} L`;
  return inrWhole.format(n);
}

/** Counts with Indian grouping: 4,327 and 12,34,567 */
export function formatNumber(val) {
  if (val === null || val === undefined || val === '' || Number.isNaN(Number(val))) return '—';
  return plainIn.format(Number(val));
}
