import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  MenuItem,
  CircularProgress,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { api, toApiError } from '../../api/client';
import PageHeader from '../../components/PageHeader';

export default function SubscriptionCreatePage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const { data: customers } = useQuery({
    queryKey: ['customers', { pageSize: 100 }],
    queryFn: () => api.get('/customers', { params: { pageSize: 100 } }).then((r) => r.data),
  });

  const { data: plans } = useQuery({
    queryKey: ['plans', { available: 'true' }],
    queryFn: () => api.get('/plans', { params: { available: 'true' } }).then((r) => r.data),
  });

  const { data: templates } = useQuery({
    queryKey: ['quotation-templates', { pageSize: 50 }],
    queryFn: () => api.get('/quotation-templates', { params: { pageSize: 50 } }).then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: {
      customerId: '',
      planId: '',
      templateId: '',
      startDate: new Date().toISOString().slice(0, 10),
      expiryDate: '',
      paymentTermsDays: 15,
      notes: '',
    },
  });

  const selectedTemplateId = watch('templateId');

  // Handle template selection auto-fill
  const handleTemplateChange = (e) => {
    const tplId = e.target.value;
    setValue('templateId', tplId);
    if (!tplId) return;

    const tpl = (templates?.data || []).find((t) => t.id === tplId);
    if (tpl) {
      if (tpl.planId) setValue('planId', tpl.planId);
      if (tpl.paymentTermsDays) setValue('paymentTermsDays', tpl.paymentTermsDays);
      if (tpl.notes) setValue('notes', tpl.notes);
    }
  };

  const createMutation = useMutation({
    mutationFn: (formValues) => {
      const payload = {
        ...formValues,
        templateId: formValues.templateId || undefined,
        expiryDate: formValues.expiryDate || undefined,
        paymentTermsDays: Number(formValues.paymentTermsDays || 15),
      };
      return api.post('/subscriptions', payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      enqueueSnackbar('Draft subscription created successfully', { variant: 'success' });
      navigate(`/app/subscriptions/${res.data.id}`);
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
    },
  });

  return (
    <Box component="form" onSubmit={handleSubmit((d) => createMutation.mutate(d))} noValidate>
      <PageHeader
        title="Create Subscription"
        subtitle="Initialize a new agreement draft directly or from a quotation template"
        action={
          <Button
            startIcon={<ArrowBackIcon />}
            variant="outlined"
            onClick={() => navigate('/app/subscriptions')}
          >
            Back to Subscriptions
          </Button>
        }
      />

      <Card sx={{ maxWidth: 800 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Agreement Setup
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Select client account, billing plan, and start date
          </Typography>

          <Grid container spacing={2.5}>
            {/* Optional Template Starter */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                select
                label="Start from Quotation Template (Optional)"
                size="small"
                value={selectedTemplateId || ''}
                onChange={handleTemplateChange}
                helperText="Pre-fills plan and default package items"
              >
                <MenuItem value="">Custom Subscription (No template)</MenuItem>
                {(templates?.data || []).map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name} (Valid {t.validityDays} days)
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Customer Account */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Customer Account *"
                size="small"
                defaultValue=""
                {...register('customerId', { required: 'Customer is required' })}
                error={Boolean(errors.customerId)}
                helperText={errors.customerId?.message}
              >
                {(customers?.data || []).map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.fullName} {c.companyName ? `(${c.companyName})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Recurring Plan */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Recurring Plan *"
                size="small"
                defaultValue=""
                {...register('planId', { required: 'Plan is required' })}
                error={Boolean(errors.planId)}
                helperText={errors.planId?.message}
              >
                {(plans?.data || []).map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name} ({p.billingPeriod} - ₹{p.price})
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* Start Date */}
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Agreement Start Date *"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                {...register('startDate', { required: 'Start date is required' })}
                error={Boolean(errors.startDate)}
                helperText={errors.startDate?.message}
              />
            </Grid>

            {/* Expiry Date */}
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Contract Expiry (Optional)"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                {...register('expiryDate')}
                helperText="Leave blank for open-ended"
              />
            </Grid>

            {/* Payment Terms Days */}
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Payment Terms (Days) *"
                type="number"
                size="small"
                inputProps={{ min: '0' }}
                {...register('paymentTermsDays', { required: 'Terms are required' })}
                error={Boolean(errors.paymentTermsDays)}
                helperText={errors.paymentTermsDays?.message}
              />
            </Grid>

            {/* Notes */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Agreement Notes / Terms"
                size="small"
                multiline
                rows={3}
                placeholder="Special SLA conditions or client specific notes"
                {...register('notes')}
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button variant="outlined" onClick={() => navigate('/app/subscriptions')}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={createMutation.isPending}
              sx={{ minWidth: 150 }}
            >
              {createMutation.isPending ? <CircularProgress size={24} /> : 'Create Draft'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

