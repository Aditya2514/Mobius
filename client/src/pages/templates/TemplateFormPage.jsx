import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  MenuItem,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  CircularProgress,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { api, toApiError } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingBlock from '../../components/LoadingBlock';

export default function TemplateFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const [lines, setLines] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [lineQty, setLineQty] = useState(1);

  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/plans').then((r) => r.data),
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/products').then((r) => r.data),
  });

  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ['quotation-template', id],
    queryFn: () => api.get(`/quotation-templates/${id}`).then((r) => r.data),
    enabled: isEdit,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: '',
      planId: '',
      validityDays: 30,
      paymentTermsDays: 15,
      notes: '',
    },
  });

  useEffect(() => {
    if (template) {
      reset({
        name: template.name,
        planId: template.planId || '',
        validityDays: template.validityDays || 30,
        paymentTermsDays: template.paymentTermsDays || 15,
        notes: template.notes || '',
      });
      setLines(template.lines || []);
    }
  }, [template, reset]);

  const currentProductObj = (products?.data || []).find((p) => p.id === selectedProduct);
  const availableVariants = currentProductObj?.variants || [];

  const handleAddLine = () => {
    if (!currentProductObj) {
      enqueueSnackbar('Select a product to add to the template', { variant: 'warning' });
      return;
    }
    const varObj = availableVariants.find((v) => v.id === selectedVariant);
    const unitPrice =
      Number(currentProductObj.salesPrice) + Number(varObj?.extraPrice || 0);

    const newLine = {
      productId: currentProductObj.id,
      productName: currentProductObj.name,
      variantId: varObj?.id || null,
      variantName: varObj ? `${varObj.attribute}: ${varObj.value}` : null,
      quantity: Number(lineQty || 1),
      unitPrice: unitPrice.toFixed(2),
      taxId: currentProductObj.defaultTax?.id || null,
      taxName: currentProductObj.defaultTax?.name || null,
    };

    setLines([...lines, newLine]);
    setSelectedProduct('');
    setSelectedVariant('');
    setLineQty(1);
  };

  const handleRemoveLine = (idx) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  const saveMutation = useMutation({
    mutationFn: (formValues) => {
      const payload = {
        ...formValues,
        validityDays: Number(formValues.validityDays),
        paymentTermsDays: Number(formValues.paymentTermsDays),
        lines,
      };
      if (isEdit) {
        return api.patch(`/quotation-templates/${id}`, payload);
      }
      return api.post('/quotation-templates', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotation-templates'] });
      enqueueSnackbar(isEdit ? 'Template updated' : 'Template created', { variant: 'success' });
      navigate('/app/templates');
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
    },
  });

  if (isEdit && templateLoading) {
    return <LoadingBlock message="Loading template details..." />;
  }

  return (
    <Box component="form" onSubmit={handleSubmit((d) => saveMutation.mutate(d))} noValidate>
      <PageHeader
        title={isEdit ? `Edit Template: ${template?.name || ''}` : 'New Quotation Template'}
        subtitle="Configure default subscription lines and quotation duration"
        action={
          <Button
            startIcon={<ArrowBackIcon />}
            variant="outlined"
            onClick={() => navigate('/app/templates')}
          >
            Back to Templates
          </Button>
        }
      />

      <Grid container spacing={3}>
        {/* Header Details */}
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Template Details
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Default values applied when generating a quote
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Template Name *"
                    size="small"
                    placeholder="e.g. Starter CRM 5-Seat Package"
                    {...register('name', { required: 'Template name is required' })}
                    error={Boolean(errors.name)}
                    helperText={errors.name?.message}
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    select
                    label="Assigned Plan *"
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

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Validity Days *"
                    type="number"
                    size="small"
                    inputProps={{ min: '1' }}
                    {...register('validityDays', { required: 'Validity is required' })}
                    error={Boolean(errors.validityDays)}
                    helperText={errors.validityDays?.message}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
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

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Notes / Terms"
                    size="small"
                    multiline
                    rows={3}
                    placeholder="Standard terms shown on quotes"
                    {...register('notes')}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Template Line Items */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Preset Line Items
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Products pre-filled whenever staff chooses this template
              </Typography>

              {/* Add Line Controls */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                <TextField
                  select
                  size="small"
                  label="Product"
                  value={selectedProduct}
                  onChange={(e) => {
                    setSelectedProduct(e.target.value);
                    setSelectedVariant('');
                  }}
                  sx={{ flex: 1.2, minWidth: 140 }}
                >
                  {(products?.data || []).map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} (₹{p.salesPrice})
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  size="small"
                  label="Variant"
                  value={selectedVariant}
                  onChange={(e) => setSelectedVariant(e.target.value)}
                  disabled={availableVariants.length === 0}
                  sx={{ flex: 1, minWidth: 120 }}
                >
                  <MenuItem value="">None</MenuItem>
                  {availableVariants.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.attribute}: {v.value} (+₹{v.extraPrice})
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  size="small"
                  label="Qty"
                  type="number"
                  inputProps={{ min: '1' }}
                  value={lineQty}
                  onChange={(e) => setLineQty(Math.max(1, Number(e.target.value)))}
                  sx={{ width: 80 }}
                />

                <Button variant="outlined" onClick={handleAddLine} sx={{ minWidth: 40, px: 1.5 }}>
                  <AddIcon />
                </Button>
              </Box>

              {/* Lines Table */}
              <Table size="small">
                <TableHead sx={{ bgcolor: '#f8fafc' }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Product</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Qty
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Unit Price
                    </TableCell>
                    <TableCell align="right" sx={{ width: 40 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.length > 0 ? (
                    lines.map((l, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {l.productName}
                          </Typography>
                          {l.variantName && (
                            <Typography variant="caption" color="text.secondary">
                              {l.variantName}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">{l.quantity}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          ₹{Number(l.unitPrice).toFixed(2)}
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveLine(idx)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                        No preset lines. Quotes will start empty.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button variant="outlined" onClick={() => navigate('/app/templates')}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={saveMutation.isPending}
          sx={{ minWidth: 140 }}
        >
          {saveMutation.isPending ? <CircularProgress size={24} /> : 'Save Template'}
        </Button>
      </Box>
    </Box>
  );
}

