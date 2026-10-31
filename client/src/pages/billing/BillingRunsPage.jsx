import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Chip,
  CircularProgress,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import PlayCircleFilledWhiteOutlinedIcon from '@mui/icons-material/PlayCircleFilledWhiteOutlined';
import { api, toApiError } from '../../api/client';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { useListParams } from '../../hooks/useListParams';
import { formatDate, formatDateTime } from '../../utils/format';

export default function BillingRunsPage() {
  const [params, setParams] = useListParams({ page: 1, pageSize: 25 });
  const [billingDate, setBillingDate] = useState(new Date().toISOString().slice(0, 10));
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ['billing-runs', params],
    queryFn: () => api.get('/billing/runs', { params }).then((r) => r.data),
  });

  const runMutation = useMutation({
    mutationFn: () => api.post('/billing/run', { date: billingDate }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['billing-runs'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      enqueueSnackbar(
        `Billing run complete: ${res.data.invoicesCreated} invoices created, ${res.data.closed} subscriptions auto-closed.`,
        { variant: res.data.invoicesCreated > 0 ? 'success' : 'info' }
      );
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
    },
  });

  const columns = [
    {
      field: 'runDate',
      headerName: 'Billing Date',
      width: 140,
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={600}>
          {formatDate(p.value)}
        </Typography>
      ),
    },
    {
      field: 'invoicesCreated',
      headerName: 'Invoices Created',
      width: 160,
      align: 'center',
      headerAlign: 'center',
      renderCell: (p) => (
        <Chip
          size="small"
          label={`${p.value} invoice${p.value !== 1 ? 's' : ''}`}
          color={p.value > 0 ? 'primary' : 'default'}
          sx={{ fontWeight: 600 }}
        />
      ),
    },
    {
      field: 'subscriptionsClosed',
      headerName: 'Subscriptions Closed',
      width: 180,
      align: 'center',
      headerAlign: 'center',
      renderCell: (p) => (
        <Typography variant="body2" color="text.secondary">
          {p.value} closed
        </Typography>
      ),
    },
    {
      field: 'startedAt',
      headerName: 'Execution Time',
      flex: 1.2,
      renderCell: (p) => (
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(p.value)}
        </Typography>
      ),
    },
    {
      field: 'errors',
      headerName: 'Errors',
      width: 120,
      renderCell: (p) => {
        const count = p.value?.length || 0;
        return (
          <Chip
            size="small"
            label={count ? `${count} errors` : 'Clean (0)'}
            color={count ? 'error' : 'success'}
            variant="outlined"
          />
        );
      },
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Automated Billing Engine Runs"
        subtitle="Daily recurring execution logs, manual triggers, and idempotency audit tracking"
      />

      {/* Manual Trigger Card */}
      <Card sx={{ mb: 4, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)' }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Manual Billing Run Trigger
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={2.5}>
            Triggers the billing engine for all ACTIVE subscriptions with a next billing date due on or before the selected date. Safe to run multiple times: the database constraint guarantees no period is billed twice.
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label="Run Billing For Date"
              type="date"
              size="small"
              value={billingDate}
              onChange={(e) => setBillingDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ width: 220 }}
            />

            <Button
              variant="contained"
              color="primary"
              size="medium"
              startIcon={runMutation.isPending ? <CircularProgress size={20} color="inherit" /> : <PlayCircleFilledWhiteOutlinedIcon />}
              disabled={runMutation.isPending}
              onClick={() => runMutation.mutate()}
              sx={{ px: 3 }}
            >
              Run Billing Now
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Run History Table */}
      <Typography variant="h6" fontWeight={600} mb={1.5}>
        Execution Run History
      </Typography>
      <DataTable
        columns={columns}
        query={{ data, isFetching }}
        params={params}
        setParams={setParams}
      />
    </Box>
  );
}

