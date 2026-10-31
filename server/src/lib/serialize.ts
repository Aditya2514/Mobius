import { Decimal } from './money';
import { toISODate } from './dates';

const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/**
 * Columns that are Postgres DATE (calendar dates). They are sent as "YYYY-MM-DD".
 * Every other Date is a TIMESTAMPTZ and is sent as full ISO 8601 UTC.
 */
const DATE_COLUMNS = [
  'start_date', 'end_date', 'expiry_date', 'quotation_valid_until', 'next_billing_date', 'paused_at',
  'period_start', 'period_end', 'invoice_date', 'due_date', 'paid_on',
  'available_from', 'available_to', 'run_date', 'billing_anchor',
];
// match both the column name and its camelCase form (services may build camelCase objects)
const DATE_ONLY = new Set([...DATE_COLUMNS, ...DATE_COLUMNS.map(camel)]);

/** Works for decimal.js and Prisma's bundled copy of it. */
function isDecimal(v: object): v is Decimal {
  if (Decimal.isDecimal(v)) return true;
  const o = v as { d?: unknown; e?: unknown; s?: unknown; toFixed?: unknown };
  return Array.isArray(o.d) && typeof o.e === 'number' && typeof o.s === 'number' && typeof o.toFixed === 'function';
}

function convert(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return key && DATE_ONLY.has(key) ? toISODate(value) : value.toISOString();
  if (Array.isArray(value)) return value.map((v) => convert(v));
  if (typeof value === 'object') {
    if (isDecimal(value)) return value.toFixed(2);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[camel(k)] = convert(v, k);
    return out;
  }
  return value;
}

/**
 * Turn database rows into contract JSON: BigInt → "42", Decimal → "0.00",
 * DATE → "YYYY-MM-DD", timestamps → ISO, snake_case keys → camelCase.
 * Every response body goes through this.
 */
export function serialize<T = unknown>(value: unknown): T {
  return convert(value) as T;
}
