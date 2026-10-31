import React from 'react';
import { Box, Button, Typography, Chip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AddIcon from '@mui/icons-material/Add';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { useListParams } from '../../hooks/useListParams';

export default function TemplatesPage() {
  const [params, setParams] = useListParams({ page: 1, pageSize: 25 });
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';

  const { data, isFetching } = useQuery({
    queryKey: ['quotation-templates', params],
    queryFn: () => api.get('/quotation-templates', { params }).then((r) => r.data),
  });

  const columns = [
    {
      field: 'name',
      headerName: 'Template Name',
      flex: 1.2,
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={600}>
          {p.value}
        </Typography>
      ),
    },
    {
      field: 'planName',
      headerName: 'Default Plan',
      flex: 1,
      renderCell: (p) => p.row.plan?.name || p.value || 'Standard',
    },
    {
      field: 'validityDays',
      headerName: 'Quote Validity',
      width: 140,
      renderCell: (p) => `${p.value} days`,
    },
    {
      field: 'paymentTermsDays',
      headerName: 'Payment Terms',
      width: 140,
      renderCell: (p) => `${p.value} days net`,
    },
    {
      field: 'lineCount',
      headerName: 'Preset Lines',
      width: 130,
      sortable: false,
      renderCell: (p) => {
        // the list endpoint sends lineCount (the lines themselves only come with one template)
        const count = Number(p.value ?? p.row.lines?.length ?? 0);
        return (
          <Chip size="small" label={`${count} line${count === 1 ? '' : 's'}`} variant="outlined" />
        );
      },
    },
    ...(isAdmin
      ? [
          {
            field: 'actions',
            headerName: '',
            width: 100,
            sortable: false,
            renderCell: (p) => (
              <Button size="small" onClick={() => navigate(`/app/templates/${p.row.id}/edit`)}>
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
        title="Quotation Templates"
        subtitle="Pre-configured quotes with preset plans, lines, validity, and payment terms"
        action={
          isAdmin ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate('/app/templates/new')}
            >
              Add Template
            </Button>
          ) : null
        }
      />

      <DataTable
        columns={columns}
        query={{ data, isFetching }}
        params={params}
        setParams={setParams}
        onRowClick={isAdmin ? (row) => navigate(`/app/templates/${row.id}/edit`) : undefined}
      />
    </Box>
  );
}

