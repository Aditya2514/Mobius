import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
  Chip,
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
import PageHeader from '../../components/PageHeader';
import LoadingBlock from '../../components/LoadingBlock';

export default function TaxesPage() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTax, setEditingTax] = useState(null);

  const { data: taxes, isLoading } = useQuery({
    queryKey: ['taxes'],
    queryFn: () => api.get('/taxes').then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  const handleOpen = (tax = null) => {
    setEditingTax(tax);
    if (tax) {
      reset({ name: tax.name, rate: tax.rate });
    } else {
      reset({ name: '', rate: '18.00' });
    }
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setEditingTax(null);
    reset();
  };

  const saveMutation = useMutation({
    mutationFn: (vals) => {
      if (editingTax) {
        return api.patch(`/taxes/${editingTax.id}`, vals);
      }
      return api.post('/taxes', vals);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['taxes'] });
      enqueueSnackbar(editingTax ? 'Tax rule updated' : 'Tax rule created', { variant: 'success' });
      handleClose();
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
    },
  });

  if (isLoading) {
    return <LoadingBlock message="Loading tax categories..." />;
  }

  return (
    <Box>
      <PageHeader
        title="GST Tax Rates"
        subtitle="Manage active GST brackets applied to invoice lines"
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}>
            Add Tax Rate
          </Button>
        }
      />

      <Card sx={{ maxWidth: 800 }}>
        <CardContent sx={{ p: 0 }}>
          <Table>
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Tax Name</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  Rate (%)
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Status
                </TableCell>
                <TableCell align="right" sx={{ width: 100 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(taxes || []).map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {Number(t.rate).toFixed(2)}%
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={t.isActive ? 'Active' : 'Inactive'}
                      color={t.isActive ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => handleOpen(t)}>
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tax Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="xs" fullWidth>
        <Box component="form" onSubmit={handleSubmit((d) => saveMutation.mutate(d))} noValidate>
          <DialogTitle>{editingTax ? 'Edit Tax Rule' : 'Add New Tax Rate'}</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              label="Tax Rule Name *"
              size="small"
              margin="normal"
              placeholder="e.g. GST 18%"
              {...register('name', { required: 'Name is required' })}
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
            />
            <TextField
              fullWidth
              label="Tax Rate (%) *"
              type="number"
              size="small"
              margin="normal"
              inputProps={{ min: '0', max: '100', step: '0.01' }}
              {...register('rate', { required: 'Rate is required' })}
              error={Boolean(errors.rate)}
              helperText={errors.rate?.message}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleClose} color="inherit">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <CircularProgress size={20} /> : 'Save Tax'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

