import React from 'react';
import { Box, Button, Tabs, Tab, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import { api } from '../../api/client';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import Money from '../../components/Money';
import { useListParams } from '../../hooks/useListParams';
import { formatDate } from '../../utils/format';

const TABS = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Quotation', value: 'QUOTATION' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Paused', value: 'PAUSED' },
  { label: 'Closed', value: 'CLOSED' },
];

export default function SubscriptionsPage() {
  const [params, setParams] = useListParams({ page: 1, pageSize: 25, status: '' });
  const navigate = useNavigate();

  const { data, isFetching } = useQuery({
    queryKey: ['subscriptions', params],
    queryFn: () => api.get('/subscriptions', { params }).then((r) => r.data),
  });

  const currentTab = params.status || '';

  const handleTabChange = (_e, newValue) => {
    setParams({ status: newValue, page: 1 });
  };

  const columns = [
    {
      field: 'number',
      headerName: 'Subscription #',
      width: 140,
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={700} color="primary.main">
          {p.value}
        </Typography>
      ),
    },
    {
      field: 'customer',
      headerName: 'Customer',
      flex: 1.2,
      renderCell: (p) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {p.value?.name || '—'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {p.value?.email}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'plan',
      headerName: 'Plan',
      flex: 1,
      renderCell: (p) => (
        <Box>
          <Typography variant="body2" fontWeight={500}>
            {p.value?.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {p.value?.billingPeriod}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (p) => <StatusChip status={p.value} />,
    },
    {
      field: 'startDate',
      headerName: 'Start Date',
      width: 120,
      renderCell: (p) => formatDate(p.value),
    },
    {
      field: 'nextBillingDate',
      headerName: 'Next Billing',
      width: 130,
      renderCell: (p) => (p.value ? formatDate(p.value) : '—'),
    },
    {
      field: 'recurringTotal',
      headerName: 'Recurring (₹)',
      width: 140,
      align: 'right',
      headerAlign: 'right',
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={700}>
          <Money value={p.value} />
        </Typography>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Subscriptions"
        subtitle="Manage recurring client agreements, renewals, and lifecycle states"
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/app/subscriptions/new')}
          >
            New Subscription
          </Button>
        }
      />

      {/* Status Filter Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2.5 }}>
        <Tabs
          value={currentTab}
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

      {/* Table */}
      <DataTable
        columns={columns}
        query={{ data, isFetching }}
        params={params}
        setParams={setParams}
        onRowClick={(row) => navigate(`/app/subscriptions/${row.id}`)}
      />
    </Box>
  );
}

