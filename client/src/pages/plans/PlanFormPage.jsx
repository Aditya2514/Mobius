import React, { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  MenuItem,
  FormControlLabel,
  Switch,
  CircularProgress,
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { api, toApiError } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingBlock from '../../components/LoadingBlock';

export default function PlanFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', id],
    queryFn: () => api.get(`/plans/${id}`).then((r) => r.data),
    enabled: isEdit,
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      price: '1000.00',
      billingPeriod: 'MONTHLY',
      minQuantity: 1,
      availableFrom: new Date().toISOString().slice(0, 10),
      availableTo: '',
      autoClose: false,
      isClosable: true,
      isPausable: false,
      isRenewable: true,
      isActive: true,
    },
  });

  useEffect(() => {
    if (plan) {
      reset({
        name: plan.name,
        price: plan.price,
        billingPeriod: plan.billingPeriod,
        minQuantity: plan.minQuantity,
        availableFrom: plan.availableFrom,
        availableTo: plan.availableTo || '',
        autoClose: plan.autoClose,
        isClosable: plan.isClosable,
        isPausable: plan.isPausable,
        isRenewable: plan.isRenewable,
        isActive: plan.isActive,
      });
    }
  }, [plan, reset]);

  const saveMutation = useMutation({
    mutationFn: (formValues) => {
      const payload = {
        ...formValues,
        availableTo: formValues.availableTo || null,
        minQuantity: Number(formValues.minQuantity || 1),
      };
      if (isEdit) {
        return api.patch(`/plans/${id}`, payload);
      }
      return api.post('/plans', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      enqueueSnackbar(isEdit ? 'Plan updated successfully' : 'Plan created successfully', {
        variant: 'success',
      });
      navigate('/app/plans');
    },
    onError: (err) => {
      const e = toApiError(err);
      enqueueSnackbar(e.message, { variant: 'error' });
    },
  });

  if (isEdit && planLoading) {
    return <LoadingBlock message="Loading plan details..." />;
  }

  return (
    <Box component="form" onSubmit={handleSubmit((d) => saveMutation.mutate(d))} noValidate>
      <PageHeader
        title={isEdit ? `Edit Plan: ${plan?.name || ''}` : 'New Plan'}
        subtitle="Configure billing cycle, minimum seats, and customer lifecycle permissions"
        action={
          <Button
            startIcon={<ArrowBackIcon />}
            variant="outlined"
            onClick={() => navigate('/app/plans')}
          >
            Back to Plans
          </Button>
        }
      />

      <Card sx={{ maxWidth: 800 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Plan Configuration
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Set recurring terms and behavior flags
          </Typography>

          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="Plan Name *"
                size="small"
                {...register('name', { required: 'Plan name is required' })}
                error={Boolean(errors.name)}
                helperText={errors.name?.message}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                select
                label="Billing Period *"
                size="small"
                defaultValue="MONTHLY"
                {...register('billingPeriod')}
              >
                <MenuItem value="DAILY">Daily</MenuItem>
                <MenuItem value="WEEKLY">Weekly</MenuItem>
                <MenuItem value="MONTHLY">Monthly</MenuItem>
                <MenuItem value="YEARLY">Yearly</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Price per Period (₹) *"
                type="number"
                size="small"
                inputProps={{ step: '0.01', min: '0' }}
                {...register('price', { required: 'Price is required' })}
                error={Boolean(errors.price)}
                helperText={errors.price?.message}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Minimum Quantity *"
                type="number"
                size="small"
                inputProps={{ min: '1' }}
                {...register('minQuantity', { required: 'Minimum quantity is required' })}
                error={Boolean(errors.minQuantity)}
                helperText={errors.minQuantity?.message}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Available From *"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                {...register('availableFrom', { required: 'Start date is required' })}
                error={Boolean(errors.availableFrom)}
                helperText={errors.availableFrom?.message}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Available To (Optional)"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                {...register('availableTo')}
              />
            </Grid>

            {/* Lifecycle Permission Flags */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mt: 1, mb: 1.5 }}>
                Lifecycle & Automation Rules
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="isPausable"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={<Switch checked={field.value} onChange={field.onChange} />}
                        label="Allow customer / staff to pause subscription"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="isClosable"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={<Switch checked={field.value} onChange={field.onChange} />}
                        label="Allow early cancellation / closing"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="isRenewable"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={<Switch checked={field.value} onChange={field.onChange} />}
                        label="Support contract renewal"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Controller
                    name="autoClose"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={<Switch checked={field.value} onChange={field.onChange} />}
                        label="Auto-close automatically when contract expires"
                      />
                    )}
                  />
                </Grid>
              </Grid>
            </Grid>
          </Grid>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button variant="outlined" onClick={() => navigate('/app/plans')}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={saveMutation.isPending}
              sx={{ minWidth: 130 }}
            >
              {saveMutation.isPending ? <CircularProgress size={24} /> : 'Save Plan'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

