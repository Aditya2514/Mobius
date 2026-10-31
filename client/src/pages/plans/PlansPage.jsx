import React from 'react';
import { Box, Button, Chip, Typography, Tooltip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import TimerOffOutlinedIcon from '@mui/icons-material/TimerOffOutlined';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import Money from '../../components/Money';
import { useListParams } from '../../hooks/useListParams';
import { formatDate } from '../../utils/format';

export default function PlansPage() {
  const [params, setParams] = useListParams({ page: 1, pageSize: 25 });
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  const { data, isFetching } = useQuery({
    queryKey: ['plans', params],
    queryFn: () => api.get('/plans', { params }).then((r) => r.data),
  });

  const columns = [
    {
      field: 'name',
      headerName: 'Plan Name',
      flex: 1.2,
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={600}>
          {p.value}
        </Typography>
      ),
    },
    {
      field: 'billingPeriod',
      headerName: 'Billing Cycle',
      width: 130,
      renderCell: (p) => (
        <Chip size="small" label={p.value} color="primary" variant="outlined" sx={{ fontWeight: 600 }} />
      ),
    },
    {
      field: 'price',
      headerName: 'Base Price',
      width: 140,
      align: 'right',
      headerAlign: 'right',
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={600}>
          <Money value={p.value} />
        </Typography>
      ),
    },
    {
      field: 'minQuantity',
      headerName: 'Min Qty',
      width: 100,
      align: 'center',
      headerAlign: 'center',
    },
    {
      field: 'availableFrom',
      headerName: 'Available Range',
      flex: 1,
      renderCell: (p) => (
        <Typography variant="caption">
          {formatDate(p.value)} — {p.row.availableTo ? formatDate(p.row.availableTo) : 'Open-ended'}
        </Typography>
      ),
    },
    {
      field: 'flags',
      headerName: 'Allowed Features',
      width: 180,
      sortable: false,
      renderCell: (p) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={p.row.isPausable ? 'Can be Paused' : 'Cannot be Paused'}>
            <PauseCircleOutlineIcon
              fontSize="small"
              sx={{ color: p.row.isPausable ? 'warning.main' : '#cbd5e1' }}
            />
          </Tooltip>
          <Tooltip title={p.row.isClosable ? 'Can be Closed early' : 'Lock-in (Cannot close early)'}>
            <CancelOutlinedIcon
              fontSize="small"
              sx={{ color: p.row.isClosable ? 'error.main' : '#cbd5e1' }}
            />
          </Tooltip>
          <Tooltip title={p.row.isRenewable ? 'Auto-renewable' : 'Non-renewable'}>
            <AutorenewOutlinedIcon
              fontSize="small"
              sx={{ color: p.row.isRenewable ? 'success.main' : '#cbd5e1' }}
            />
          </Tooltip>
          <Tooltip title={p.row.autoClose ? 'Auto-closes upon expiry' : 'Does not auto-close'}>
            <TimerOffOutlinedIcon
              fontSize="small"
              sx={{ color: p.row.autoClose ? 'info.main' : '#cbd5e1' }}
            />
          </Tooltip>
        </Box>
      ),
    },
    {
      field: 'isActive',
      headerName: 'Status',
      width: 100,
      renderCell: (p) => (
        <Chip
          size="small"
          label={p.value ? 'Active' : 'Inactive'}
          color={p.value ? 'success' : 'default'}
        />
      ),
    },
    ...(isAdmin
      ? [
          {
            field: 'actions',
            headerName: '',
            width: 100,
            sortable: false,
            renderCell: (p) => (
              <Button size="small" onClick={() => navigate(`/app/plans/${p.row.id}/edit`)}>
                Edit
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <Box>
      <PageHeader
        title="Subscription Plans"
        subtitle="Recurring billing frequency, price intervals, and cancellation rules"
        action={
          isAdmin ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/app/plans/new')}
            >
              Add Plan
            </Button>
          ) : null
        }
      />

      <DataTable
        columns={columns}
        query={{ data, isFetching }}
        params={params}
        setParams={setParams}
        onRowClick={isAdmin ? (row) => navigate(`/app/plans/${row.id}/edit`) : undefined}
      />
    </Box>
  );
}

