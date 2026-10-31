import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import AddIcon from '@mui/icons-material/Add';
import { api, toApiError } from '../../api/client';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { useListParams } from '../../hooks/useListParams';

export default function UsersPage() {
  const [params, setParams] = useListParams({ page: 1, pageSize: 25 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const { data, isFetching } = useQuery({
    queryKey: ['users', params],
    queryFn: () => api.get('/users', { params }).then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
    },
  });

  const createStaffMutation = useMutation({
    mutationFn: (vals) => api.post('/users', { ...vals, role: 'STAFF' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      enqueueSnackbar('Internal staff member added successfully', { variant: 'success' });
      setDialogOpen(false);
      reset();
    },
    onError: (err) => enqueueSnackbar(toApiError(err).message, { variant: 'error' }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }) => api.patch(`/users/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      enqueueSnackbar('User status updated', { variant: 'info' });
    },
    onError: (err) => enqueueSnackbar(toApiError(err).message, { variant: 'error' }),
  });

  const columns = [
    {
      field: 'fullName',
      headerName: 'Staff Name',
      flex: 1.2,
      renderCell: (p) => (
        <Typography variant="body2" fontWeight={600}>
          {p.value}
        </Typography>
      ),
    },
    {
      field: 'email',
      headerName: 'Email Address',
      flex: 1.2,
    },
    {
      field: 'role',
      headerName: 'Role',
      width: 140,
      renderCell: (p) => (
        <Chip
          size="small"
          label={p.value}
          color={p.value === 'ADMIN' ? 'primary' : 'secondary'}
          sx={{ fontWeight: 600 }}
        />
      ),
    },
    {
      field: 'isActive',
      headerName: 'Status',
      width: 120,
      renderCell: (p) => (
        <Chip
          size="small"
          label={p.value ? 'Active' : 'Deactivated'}
          color={p.value ? 'success' : 'default'}
        />
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 140,
      sortable: false,
      renderCell: (p) => {
        if (p.row.role === 'ADMIN') return null; // Protect primary admin from deactivation
        return (
          <Button
            size="small"
            color={p.row.isActive ? 'error' : 'success'}
            onClick={() =>
              toggleStatusMutation.mutate({ id: p.row.id, isActive: !p.row.isActive })
            }
          >
            {p.row.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        );
      },
    },
  ];

  return (
    <Box>
      <PageHeader
        title="Staff & User Management"
        subtitle="Manage administrative operators, internal staff accounts, and access controls"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            Add Staff Member
          </Button>
        }
      />

      <DataTable
        columns={columns}
        query={{ data, isFetching }}
        params={params}
        setParams={setParams}
      />

      {/* Add Staff Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <Box
          component="form"
          onSubmit={handleSubmit((d) => createStaffMutation.mutate(d))}
          noValidate
        >
          <DialogTitle sx={{ fontWeight: 700 }}>Add Internal Staff</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Staff Full Name *"
              size="small"
              margin="normal"
              {...register('fullName', { required: 'Name is required' })}
              error={Boolean(errors.fullName)}
              helperText={errors.fullName?.message}
            />

            <TextField
              fullWidth
              label="Email Address *"
              type="email"
              size="small"
              margin="normal"
              {...register('email', { required: 'Email is required' })}
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
            />

            <TextField
              fullWidth
              label="Temporary Password *"
              type="password"
              size="small"
              margin="normal"
              placeholder="Min 9 chars, upper, lower, special"
              {...register('password', {
                required: 'Password is required',
                minLength: { value: 9, message: 'Must be more than 8 characters' },
              })}
              error={Boolean(errors.password)}
              helperText={errors.password?.message}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDialogOpen(false)} color="inherit">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={createStaffMutation.isPending}
            >
              {createStaffMutation.isPending ? <CircularProgress size={20} /> : 'Create Account'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

