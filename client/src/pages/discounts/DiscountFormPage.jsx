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
  CircularProgress,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { api, toApiError } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingBlock from '../../components/LoadingBlock';

export default function DiscountFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/products').then((r) => r.data),
  });

  const { data: discount, isLoading: discountLoading } = useQuery({
    queryKey: ['discount', id],
    queryFn: () => api.get(`/discounts/${id}`).then((r) => r.data),
    enabled: isEdit,
  });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      type: 'PERCENTAGE',
      value: '10.00',
      scope: 'PRODUCT',
      minPurchase: '0.00',
      minQuantity: 1,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      usageLimit: '',
      productIds: [],
    },
  });

  const discountType = watch('type');
  const discountScope = watch('scope');

  useEffect(() => {
    if (discount) {
      reset({
        name: discount.name,
        type: discount.type,
        value: discount.value,
        scope: discount.scope,
        minPurchase: discount.minPurchase,
        minQuantity: discount.minQuantity,
        startDate: discount.startDate,
        endDate: discount.endDate || '',
        usageLimit: discount.usageLimit ? String(discount.usageLimit) : '',
        productIds: discount.productIds || [],
      });
    }
  }, [discount, reset]);

  const saveMutation = useMutation({
    mutationFn: (formValues) => {
      const payload = {
        ...formValues,
        endDate: formValues.endDate || null,
        usageLimit: formValues.usageLimit ? Number(formValues.usageLimit) : null,
        minQuantity: Number(formValues.minQuantity || 0),
        minPurchase: Number(formValues.minPurchase || 0).toFixed(2),
        value: Number(formValues.value).toFixed(2),
      };
      if (isEdit) {
        return api.patch(`/discounts/${id}`, payload);
      }
      return api.post('/discounts', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['discounts'] });
      enqueueSnackbar(isEdit ? 'Discount updated' : 'Discount created', { variant: 'success' });
      navigate('/app/discounts');
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
    },
  });

  if (isEdit && discountLoading) {
    return <LoadingBlock message="Loading discount details..." />;
  }

  return (
    <Box component="form" onSubmit={handleSubmit((d) => saveMutation.mutate(d))} noValidate>
      <PageHeader
        title={isEdit ? `Edit Discount: ${discount?.name || ''}` : 'New Discount Rule'}
        subtitle="Set promotional discount values, eligibility thresholds, and usage limits"
        action={
          <Button
            startIcon={<ArrowBackIcon />}
            variant="outlined"
            onClick={() => navigate('/app/discounts')}
          >
            Back to Discounts
          </Button>
        }
      />

      <Card sx={{ maxWidth: 800 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Discount Properties
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Rules evaluated automatically during billing calculation
          </Typography>

          <Grid container spacing={2.5}>
            <Grid item xs={12} sm={8}>
              <TextField
                fullWidth
                label="Discount Name *"
                size="small"
                placeholder="e.g. Seats 10%"
                {...register('name', { required: 'Name is required' })}
                error={Boolean(errors.name)}
                helperText={errors.name?.message}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                select
                label="Discount Type *"
                size="small"
                defaultValue="PERCENTAGE"
                {...register('type')}
              >
                <MenuItem value="PERCENTAGE">Percentage (%)</MenuItem>
                <MenuItem value="FIXED">Fixed Amount (₹)</MenuItem>
              </TextField>
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={discountType === 'PERCENTAGE' ? 'Discount Value (%) *' : 'Discount Value (₹) *'}
                type="number"
                size="small"
                inputProps={{
                  min: '0.01',
                  max: discountType === 'PERCENTAGE' ? '100' : undefined,
                  step: '0.01',
                }}
                {...register('value', { required: 'Value is required' })}
                error={Boolean(errors.value)}
                helperText={errors.value?.message}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                select
                label="Scope *"
                size="small"
                defaultValue="PRODUCT"
                {...register('scope')}
              >
                <MenuItem value="PRODUCT">Product Specific (per line)</MenuItem>
                <MenuItem value="SUBSCRIPTION">Entire Subscription (total)</MenuItem>
              </TextField>
            </Grid>

            {discountScope === 'PRODUCT' && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  SelectProps={{ multiple: true }}
                  label="Target Products *"
                  size="small"
                  defaultValue={[]}
                  {...register('productIds')}
                  helperText="Select which catalog products this discount applies to"
                >
                  {(products?.data || []).map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} (₹{p.salesPrice})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Min Purchase Requirement (₹)"
                type="number"
                size="small"
                inputProps={{ min: '0', step: '0.01' }}
                {...register('minPurchase')}
                helperText="Minimum subtotal required to qualify"
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Min Quantity Requirement"
                type="number"
                size="small"
                inputProps={{ min: '0' }}
                {...register('minQuantity')}
                helperText="Minimum seat/item quantity"
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Start Date *"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                {...register('startDate', { required: 'Start date is required' })}
                error={Boolean(errors.startDate)}
                helperText={errors.startDate?.message}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="End Date (Optional)"
                type="date"
                size="small"
                InputLabelProps={{ shrink: true }}
                {...register('endDate')}
              />
            </Grid>

            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                label="Max Usage Limit"
                type="number"
                size="small"
                placeholder="Unlimited if blank"
                inputProps={{ min: '1' }}
                {...register('usageLimit')}
                helperText="Total redemption capacity"
              />
            </Grid>
          </Grid>

          <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button variant="outlined" onClick={() => navigate('/app/discounts')}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={saveMutation.isPending}
              sx={{ minWidth: 140 }}
            >
              {saveMutation.isPending ? <CircularProgress size={24} /> : 'Save Discount'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

