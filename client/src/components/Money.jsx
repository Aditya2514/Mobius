import React from 'react';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

export default function Money({ value, sx = {} }) {
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', ...sx }}>
      {value == null ? '—' : inr.format(Number(value))}
    </span>
  );
}

