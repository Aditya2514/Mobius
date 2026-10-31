import React from 'react';
import { Box, Button, Chip, Typography, LinearProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { useListParams } from '../../hooks/useListParams';
import { formatDate } from '../../utils/format';

export default function DiscountsPage() {
  const [params, setParams] = useListParams({ page: 1, pageSize: 25 });
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  const { data, isFetching } = useQuery({
    queryKey: ['discounts', params],
    queryFn: () => api.get('/discounts', { params }).then((r) => r.data),
  });

  const columns = [
    {
      field: 'name',
      headerName: 'Discount Rule',
      flex: 1.2,
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={600}>
          {p.value}
        </Typography>
      ),
    },
    {
      field: 'value',
      headerName: 'Discount Value',
      width: 140,
      renderCell: (p) => (
        <Chip
          size="small"
          label={p.row.type === 'PERCENTAGE' ? `${p.value}% OFF` : `₹${p.value} OFF`}
          color="secondary"
          variant="filled"
          sx={{ fontWeight: 600 }}
        />
      ),
    },
    {
      field: 'scope',
      headerName: 'Scope',
      width: 140,
      renderCell: (p) => (
        <Chip size="small" label={p.value} variant="outlined" sx={{ fontWeight: 500 }} />
      ),
    },
    {
      field: 'usage',
      headerName: 'Redemption Usage',
      width: 180,
      renderCell: (p) => {
        const used = p.row.usedCount || 0;
        const limit = p.row.usageLimit;
        if (!limit) {
          return (
            <Typography variant="caption" color="text.secondary">
              {used} used (Unlimited)
            </Typography>
          );
        }
        const pct = Math.min(100, Math.round((used / limit) * 100));
        return (
          <Box sx={{ width: '100%', pr: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600}>
                {used} / {limit}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {pct}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={pct}
              color={pct >= 100 ? 'error' : 'primary'}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
        );
      },
    },
    {
      field: 'startDate',
      headerName: 'Active Window',
      flex: 1,
      renderCell: (p) => (
        <Typography variant="caption">
          {formatDate(p.value)} — {p.row.endDate ? formatDate(p.row.endDate) : 'Indefinite'}
        </Typography>
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
              <Button size="small" onClick={() => navigate(`/app/discounts/${p.row.id}/edit`)}>
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
        title="Promotions & Discounts"
        subtitle="Automatic product line and subscription level price reductions"
        action={
          isAdmin ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/app/discounts/new')}
            >
              Add Discount
            </Button>
          ) : null
        }
      />

      <DataTable
        columns={columns}
        query={{ data, isFetching }}
        params={params}
        setParams={setParams}
        onRowClick={isAdmin ? (row) => navigate(`/app/discounts/${row.id}/edit`) : undefined}
      />
    </Box>
  );
}

