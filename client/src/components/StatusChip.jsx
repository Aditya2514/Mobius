import React from 'react';
import { Chip } from '@mui/material';

const MAP = {
  DRAFT: ['Draft', 'default'],
  QUOTATION: ['Quotation', 'info'],
  CONFIRMED: ['Confirmed', 'secondary'],
  ACTIVE: ['Active', 'success'],
  PAUSED: ['Paused', 'warning'],
  CLOSED: ['Closed', 'default'],
  PAID: ['Paid', 'success'],
  CANCELLED: ['Cancelled', 'default'],
  OVERDUE: ['Overdue', 'error'],
};

export default function StatusChip({ status, overdue, sx = {} }) {
  const [label, color] = MAP[overdue ? 'OVERDUE' : status] ?? [status, 'default'];
  return (
    <Chip
      size="small"
      label={label}
      color={color}
      variant={status === 'CLOSED' ? 'outlined' : 'filled'}
      sx={{ fontWeight: 500, ...sx }}
    />
  );
}

