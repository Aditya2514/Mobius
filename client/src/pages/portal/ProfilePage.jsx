import React, { useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  CircularProgress,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { api, toApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import LoadingBlock from '../../components/LoadingBlock';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get('/me').then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      fullName: '',
      companyName: '',
      phone: '',
      address: '',
      gstin: '',
    },
  });

  useEffect(() => {
    if (profile) {
      reset({
        fullName: profile.fullName || '',
        companyName: profile.companyName || '',
        phone: profile.phone || '',
        address: profile.address || '',
        gstin: profile.gstin || '',
      });
    }
  }, [profile, reset]);

  const updateMutation = useMutation({
    mutationFn: (vals) => api.patch('/me', vals),
    onSuccess: (res) => {
      setUser({ ...user, ...res.data });
      enqueueSnackbar('Profile updated successfully', { variant: 'success' });
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
    },
  });

  if (isLoading) {
    return <LoadingBlock message="Loading profile..." />;
  }

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Billing Profile
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Update your company details and invoicing address
        </Typography>
      </Box>

      <Card sx={{ maxWidth: 700, border: '1px solid #e2e8f0', borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          <Box
            component="form"
            onSubmit={handleSubmit((d) => updateMutation.mutate(d))}
            noValidate
          >
            <Grid container spacing={2.5}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Full Name *"
                  size="small"
                  {...register('fullName', { required: 'Name is required' })}
                  error={Boolean(errors.fullName)}
                  helperText={errors.fullName?.message}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Email Address"
                  size="small"
                  disabled
                  value={profile?.email || ''}
                  helperText="Email is permanently assigned"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Company Name"
                  size="small"
                  {...register('companyName')}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Phone Number"
                  size="small"
                  {...register('phone')}
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="GSTIN Identification Number"
                  size="small"
                  placeholder="e.g. 32AABCB1234F1Z5"
                  {...register('gstin')}
                  helperText="Printed on tax invoices for GST input tax credit"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Billing & Registered Address"
                  size="small"
                  multiline
                  rows={3}
                  {...register('address')}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={updateMutation.isPending}
                sx={{ minWidth: 150 }}
              >
                {updateMutation.isPending ? <CircularProgress size={24} /> : 'Save Changes'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

