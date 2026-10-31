import React, { useState } from 'react';
import {
  Box,
  Button,
  Drawer,
  TextField,
  Typography,
  Chip,
  InputAdornment,
  Divider,
  CircularProgress,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import { api, toApiError } from '../../api/client';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { useListParams } from '../../hooks/useListParams';
import { formatDate } from '../../utils/format';

export default function CustomersPage() {
  const [params, setParams] = useListParams({ page: 1, pageSize: 25 });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ['customers', params],
    queryFn: () => api.get('/customers', { params }).then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  const handleOpenDrawer = (customer = null) => {
    setEditingCustomer(customer);
    if (customer) {
      reset({
        fullName: customer.fullName,
        companyName: customer.companyName || '',
        email: customer.email,
        phone: customer.phone || '',
        address: customer.address || '',
        gstin: customer.gstin || '',
      });
    } else {
      reset({
        fullName: '',
        companyName: '',
        email: '',
        phone: '',
        address: '',
        gstin: '',
      });
    }
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setEditingCustomer(null);
    reset();
  };

  const saveMutation = useMutation({
    mutationFn: (formValues) => {
      if (editingCustomer) {
        return api.patch(`/customers/${editingCustomer.id}`, formValues);
      }
      return api.post('/customers', formValues);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      enqueueSnackbar(
        editingCustomer ? 'Customer updated successfully' : 'Customer created successfully',
        { variant: 'success' }
      );
      handleCloseDrawer();
    },
    onError: (err) => {
      const e = toApiError(err);
      enqueueSnackbar(e.message, { variant: 'error' });
    },
  });

  const onSubmit = (values) => {
    saveMutation.mutate(values);
  };

  const columns = [
    {
      field: 'fullName',
      headerName: 'Customer Name',
      flex: 1.2,
      renderCell: (p) => (
        <Box>
          <Typography variant="body2" fontWeight={600}>
            {p.value}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {p.row.email}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'companyName',
      headerName: 'Company',
      flex: 1,
      renderCell: (p) => p.value || '—',
    },
    {
      field: 'phone',
      headerName: 'Phone',
      flex: 0.9,
      renderCell: (p) => p.value || '—',
    },
    {
      field: 'gstin',
      headerName: 'GSTIN',
      flex: 0.9,
      renderCell: (p) => (
        <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {p.value || '—'}
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
          variant="filled"
        />
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 100,
      sortable: false,
      renderCell: (p) => (
        <Button size="small" onClick={() => handleOpenDrawer(p.row)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Customers"
        subtitle="Manage client accounts, billing profiles, and contact details"
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDrawer()}
          >
            Add Customer
          </Button>
        }
      />

      {/* Filter / Search Bar */}
      <Box sx={{ mb: 2.5, maxWidth: 360 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search by name, company, email..."
          value={params.q || ''}
          onChange={(e) => setParams({ q: e.target.value })}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Table */}
      <DataTable
        columns={columns}
        query={{ data, isFetching }}
        params={params}
        setParams={setParams}
        onRowClick={(row) => handleOpenDrawer(row)}
      />

      {/* Add / Edit Customer Drawer */}
      <Drawer anchor="right" open={drawerOpen} onClose={handleCloseDrawer}>
        <Box
          component="form"
          onSubmit={handleSubmit(onSubmit)}
          sx={{ width: { xs: 320, sm: 420 }, p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          <Typography variant="h6" fontWeight={700} gutterBottom>
            {editingCustomer ? 'Edit Customer' : 'New Customer'}
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            {editingCustomer ? 'Update billing and account details' : 'Create a customer profile for subscriptions'}
          </Typography>

          <Divider sx={{ mb: 3 }} />

          <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Full Name *"
              size="small"
              {...register('fullName', { required: 'Name is required' })}
              error={Boolean(errors.fullName)}
              helperText={errors.fullName?.message}
            />

            <TextField
              fullWidth
              label="Company Name"
              size="small"
              {...register('companyName')}
            />

            <TextField
              fullWidth
              label="Email Address *"
              type="email"
              size="small"
              disabled={Boolean(editingCustomer)} // Emails typically locked after creation
              {...register('email', { required: 'Email is required' })}
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
            />

            <TextField
              fullWidth
              label="Phone Number"
              size="small"
              {...register('phone')}
            />

            <TextField
              fullWidth
              label="GSTIN"
              size="small"
              placeholder="e.g. 32AABCB1234F1Z5"
              {...register('gstin')}
            />

            <TextField
              fullWidth
              label="Billing Address"
              size="small"
              multiline
              rows={3}
              {...register('address')}
            />
          </Box>

          <Box sx={{ pt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
            <Button onClick={handleCloseDrawer} color="inherit">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <CircularProgress size={20} /> : 'Save Customer'}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}

