import React from 'react';
import { Box, Button, Chip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import Money from '../../components/Money';
import { useListParams } from '../../hooks/useListParams';

export default function ProductsPage() {
  const [params, setParams] = useListParams({ page: 1, pageSize: 25 });
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  const { data, isFetching } = useQuery({
    queryKey: ['products', params],
    queryFn: () => api.get('/products', { params }).then((r) => r.data),
  });

  const columns = [
    {
      field: 'name',
      headerName: 'Product Name',
      flex: 1.2,
      renderCell: (p) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {p.value}
          </Typography>
          {p.row.notes && (
            <Typography variant="caption" color="text.secondary" noWrap>
              {p.row.notes}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 120,
      renderCell: (p) => (
        <Chip size="small" label={p.value} variant="outlined" sx={{ fontWeight: 500 }} />
      ),
    },
    {
      field: 'salesPrice',
      headerName: 'Sales Price',
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
      field: 'defaultTax',
      headerName: 'Default Tax',
      width: 130,
      renderCell: (p) => (p.value ? `${p.value.name}` : 'None'),
    },
    {
      field: 'variants',
      headerName: 'Variants',
      width: 140,
      renderCell: (p) => {
        const count = p.value?.length || 0;
        return count ? (
          <Chip size="small" label={`${count} variant${count > 1 ? 's' : ''}`} color="primary" variant="outlined" />
        ) : (
          <Typography variant="caption" color="text.secondary">
            Standard
          </Typography>
        );
      },
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
              <Button size="small" onClick={() => navigate(`/app/products/${p.row.id}/edit`)}>
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
        title="Products & Services"
        subtitle="Catalog items available for quotes, subscriptions, and invoicing"
        action={
          isAdmin ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/app/products/new')}
            >
              Add Product
            </Button>
          ) : null
        }
      />

      <DataTable
        columns={columns}
        query={{ data, isFetching }}
        params={params}
        setParams={setParams}
        onRowClick={isAdmin ? (row) => navigate(`/app/products/${row.id}/edit`) : undefined}
      />
    </Box>
  );
}

