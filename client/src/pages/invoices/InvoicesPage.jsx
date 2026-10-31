import React, { useState } from 'react';
import { Box, Button, Tabs, Tab, Typography } from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { api, toApiError } from '../../api/client';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import Money from '../../components/Money';
import { useListParams } from '../../hooks/useListParams';
import { formatDate } from '../../utils/format';

const TABS = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Paid', value: 'PAID' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export default function InvoicesPage() {
  const [params, setParams] = useListParams({ page: 1, pageSize: 25, status: '' });
  const [selectedIds, setSelectedIds] = useState([]);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const isOverdueTab = params.status === 'OVERDUE';
  const queryParams = {
    ...params,
    status: isOverdueTab ? undefined : params.status || undefined,
    overdue: isOverdueTab ? 'true' : undefined,
  };

  const { data, isFetching } = useQuery({
    queryKey: ['invoices', queryParams],
    queryFn: () => api.get('/invoices', { params: queryParams }).then((r) => r.data),
  });

  const handleTabChange = (_e, val) => {
    setSelectedIds([]);
    setParams({ status: val, page: 1 });
  };

  const bulkConfirmMutation = useMutation({
    mutationFn: (ids) => api.post('/invoices/bulk-confirm', { ids }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      enqueueSnackbar(`${res.data.confirmed} invoices confirmed`, { variant: 'success' });
      setSelectedIds([]);
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
    },
  });

  const columns = [
    {
      field: 'number',
      headerName: 'Invoice #',
      width: 140,
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={700} color="primary.main">
          {p.value}
        </Typography>
      ),
    },
    {
      field: 'billTo',
      headerName: 'Customer',
      flex: 1.2,
      renderCell: (p) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {p.value?.name || p.row.billToName || '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {p.value?.email || p.row.billToEmail}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'subscriptionNumber',
      headerName: 'Agreement',
      width: 140,
      renderCell: (p) => (
        <Typography variant="caption" fontWeight={600}>
          {p.value || 'Standard'}
        </Typography>
      ),
    },
    {
      field: 'invoiceDate',
      headerName: 'Invoice Date',
      width: 120,
      renderCell: (p) => formatDate(p.value),
    },
    {
      field: 'dueDate',
      headerName: 'Due Date',
      width: 120,
      renderCell: (p) => (
        <Typography
          variant="body2"
          color={p.row.isOverdue ? 'error.main' : 'text.primary'}
          fontWeight={p.row.isOverdue ? 700 : 400}
        >
          {formatDate(p.value)}
        </Typography>
      ),
    },
    {
      field: 'total',
      headerName: 'Total (₹)',
      width: 130,
      align: 'right',
      headerAlign: 'right',
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={600}>
          <Money value={p.value} />
        </Typography>
      ),
    },
    {
      field: 'balanceDue',
      headerName: 'Balance (₹)',
      width: 130,
      align: 'right',
      headerAlign: 'right',
      renderCell: (p) => (
        <Typography
          variant="body2"
          fontWeight={700}
          color={Number(p.value) > 0 ? (p.row.isOverdue ? 'error.main' : 'text.primary') : 'success.main'}
        >
          <Money value={p.value} />
        </Typography>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (p) => <StatusChip status={p.value} overdue={p.row.isOverdue} />,
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Invoices & Receivables"
        subtitle="Manage generated bills, track outstanding dues, and confirm draft runs"
        action={
          params.status === 'DRAFT' && selectedIds.length > 0 ? (
            <Button
              variant="contained"
              color="secondary"
              startIcon={<CheckCircleOutlineIcon />}
              disabled={bulkConfirmMutation.isPending}
              onClick={() => bulkConfirmMutation.mutate(selectedIds)}
            >
              Confirm Selected ({selectedIds.length})
            </Button>
          ) : null
        }
      />

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        <Tabs
          value={params.status || ''}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
        >
          {TABS.map((tab) => (
            <Tab
              key={tab.value}
              label={tab.label}
              value={tab.value}
              sx={{ fontWeight: 600, textTransform: 'none' }}
            />
          ))}
        </Tabs>
      </Box>

      {/* Data Table */}
      <DataTable
        checkboxSelection={params.status === 'DRAFT'}
        onRowSelectionModelChange={(ids) => setSelectedIds(ids)}
        rowSelectionModel={selectedIds}
        columns={columns}
        query={{ data, isFetching }}
        params={params}
        setParams={setParams}
        onRowClick={(row) => navigate(`/app/invoices/${row.id}`)}
      />
    </Box>
  );
}

