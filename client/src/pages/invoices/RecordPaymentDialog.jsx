import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Grid,
  MenuItem,
  CircularProgress,
  Typography,
  Box,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { api, toApiError } from '../../api/client';
import Money from '../../components/Money';

export default function RecordPaymentDialog({ open, onClose, invoice }) {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      method: 'UPI',
      amount: invoice?.balanceDue || '0.00',
      paidOn: new Date().toISOString().slice(0, 10),
      reference: '',
      note: '',
    },
  });

  const paymentMutation = useMutation({
    mutationFn: (vals) => api.post(`/invoices/${invoice.id}/payments`, vals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      enqueueSnackbar('Payment recorded successfully', { variant: 'success' });
      onClose();
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
    },
  });

  if (!invoice) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={handleSubmit((d) => paymentMutation.mutate(d))} noValidate>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Record Payment for {invoice.number}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2.5, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
            <Typography variant="body2" color="text.secondary">
              Total Outstanding Balance:
            </Typography>
            <Typography variant="h6" fontWeight={800} color="error.main">
              <Money value={invoice.balanceDue} />
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Payment Method *"
                size="small"
                defaultValue="UPI"
                {...register('method', { required: 'Method is required' })}
              >
                <MenuItem value="UPI">UPI</MenuItem>
                <MenuItem value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS)</MenuItem>
                <MenuItem value="CARD">Credit / Debit Card</MenuItem>
                <MenuItem value="CASH">Cash</MenuItem>
                <MenuItem value="CHEQUE">Cheque</MenuItem>
                <MenuItem value="OTHER">Other</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Payment Amount (₹) *"
                type="number"
                size="small"
                inputProps={{
                  step: '0.01',
                  min: '0.01',
                  max: invoice.balanceDue,
                }}
                defaultValue={invoice.balanceDue}
                {...register('amount', {
                  required: 'Amount is required',
                  min: { value: 0.01, message: 'Amount must be greater than 0' },
                })}
                error={Boolean(errors.amount)}
                helperText={errors.amount?.message}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Payment Date *"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                defaultValue={new Date().toISOString().slice(0, 10)}
                {...register('paidOn', { required: 'Date is required' })}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Reference / Transaction ID"
                size="small"
                placeholder="e.g. UTR1289123 or Cheque #"
                {...register('reference')}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Payment Note (Optional)"
                size="small"
                multiline
                rows={2}
                placeholder="Internal payment confirmation note"
                {...register('note')}
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="success"
            disabled={paymentMutation.isPending}
          >
            {paymentMutation.isPending ? <CircularProgress size={22} color="inherit" /> : 'Confirm Payment'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

