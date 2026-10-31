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

