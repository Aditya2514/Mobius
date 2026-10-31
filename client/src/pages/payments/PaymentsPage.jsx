import React from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import Money from '../../components/Money';
import { useListParams } from '../../hooks/useListParams';
import { formatDate } from '../../utils/format';

export default function PaymentsPage() {
  const [params, setParams] = useListParams({ page: 1, pageSize: 25 });
  const navigate = useNavigate();

  const { data, isFetching } = useQuery({
    queryKey: ['payments', params],
    queryFn: () => api.get('/payments', { params }).then((r) => r.data),
  });

  const columns = [
    {
      field: 'paidOn',
      headerName: 'Payment Date',
      width: 130,
      renderCell: (p) => formatDate(p.value),
    },
    {
      field: 'invoiceNumber',
      headerName: 'Invoice #',
      width: 140,
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={700} color="primary.main">
          {p.value || `INV-${p.row.invoiceId}`}
        </Typography>
      ),
    },
    {
      field: 'recordedBy',
      headerName: 'Recorded By',
      flex: 1.2,
      sortable: false,
      renderCell: (p) => p.value?.name || '—',
    },
    {
      field: 'method',
      headerName: 'Payment Method',
      width: 150,
      renderCell: (p) => (
        <Chip size="small" label={p.value} color="primary" variant="outlined" sx={{ fontWeight: 600 }} />
      ),
    },
    {
      field: 'amount',
      headerName: 'Amount Received (₹)',
      width: 160,
      align: 'right',
      headerAlign: 'right',
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={700} color="success.dark">
          +<Money value={p.value} />
        </Typography>
      ),
    },
    {
      field: 'reference',
      headerName: 'Reference / UTR',
      flex: 1,
      renderCell: (p) => p.value || '—',
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Payment Transactions"
        subtitle="Complete ledger of cash collections, bank transfers, and digital settlements"
      />

      <DataTable
        columns={columns}
        query={{ data, isFetching }}
        params={params}
        setParams={setParams}
        onRowClick={(row) => row.invoiceId && navigate(`/app/invoices/${row.invoiceId}`)}
      />
    </Box>
  );
}

