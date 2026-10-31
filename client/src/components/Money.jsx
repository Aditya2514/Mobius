import React from 'react';
import { formatMoney, formatMoneyCompact } from '../utils/format';

/**
 * Renders an amount the API sent as a string. Display only.
 * compact: ₹5.13 Cr style for tight cards (the exact amount shows on hover).
 * sign: prefix "+" or "-" for adjustments such as discounts and tax lines.
 */
export default function Money({ value, compact = false, sign = '', hideZeroSign = false, sx = {} }) {
  const prefix = hideZeroSign && Number(value) === 0 ? '' : sign;
  const text = compact ? formatMoneyCompact(value) : formatMoney(value);
  return (
    <span
      title={compact ? formatMoney(value) : undefined}
      style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...sx }}
    >
      {value == null || text === '—' ? '—' : `${prefix}${text}`}
    </span>
  );
}
