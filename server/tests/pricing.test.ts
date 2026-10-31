import { describe, expect, it } from 'vitest';
import { todayIST } from '../src/lib/dates';
import { Decimal } from '../src/lib/money';
import { allocateFixed, priceLine, type Disc } from '../src/modules/billing/pricing';

const D = (v: string | number) => new Decimal(v);
const money = (d: Decimal) => d.toFixed(2);

describe('pricing (pure, no database)', () => {
  it('#1 priceLine(1560, 5, 18%, 10% off) → 7800 / 780 / 1263.60 / 8283.60', () => {
    const tenPct: Disc = { id: 1n, type: 'PERCENTAGE', value: D(10) };
    const p = priceLine(D('1560'), 5, D('18'), tenPct);
    expect([p.subtotal, p.discount, p.tax, p.total].map(money)).toEqual(['7800.00', '780.00', '1263.60', '8283.60']);
  });

  it('#2 FIXED discount larger than the line → capped at the subtotal, total never negative', () => {
    const big: Disc = { id: 1n, type: 'FIXED', value: D('5000') };
    const p = priceLine(D('999.99'), 1, D('18'), big);
    expect(money(p.discount)).toBe('999.99');
    expect(money(p.tax)).toBe('0.00');
    expect(money(p.total)).toBe('0.00');
  });

  it('rounds half-up per line', () => {
    // 0.125 × 18% = 0.0225 → 0.02; 3 × 33.335 = 100.005 → 100.01
    expect(money(priceLine(D('0.125'), 1, D('18')).tax)).toBe('0.02');
    expect(money(priceLine(D('33.335'), 3, D('0')).subtotal)).toBe('100.01');
  });

  it('FIXED subscription discount split by subtotal, remainder on the last line (₹500 → 384.87 + 98.68 + 16.45)', () => {
    const lines: { sub: Decimal; applied?: Disc }[] = [{ sub: D('7800') }, { sub: D('2000') }, { sub: D('333.33') }];
    allocateFixed({ id: 9n, type: 'FIXED', value: D('500') }, lines);
    const shares = lines.map((l) => money(l.applied!.value));
    expect(shares).toEqual(['384.87', '98.68', '16.45']);
    expect(money(shares.reduce((s, x) => s.plus(x), D(0)))).toBe('500.00');
  });

  it('#22 todayIST: 18:35 UTC on 31 Oct is 00:05 IST on 1 Nov', () => {
    expect(todayIST(new Date('2026-10-31T18:35:00Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(todayIST(new Date('2026-10-31T18:29:00Z')).toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });
});
