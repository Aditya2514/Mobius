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
  Divider,
  CircularProgress,
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { formatMoney } from '../../utils/format';
import { api, toApiError } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import LoadingBlock from '../../components/LoadingBlock';

export default function ProductFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const [variants, setVariants] = useState([]);
  const [newVarAttr, setNewVarAttr] = useState('Brand');
  const [newVarVal, setNewVarVal] = useState('');
  const [newVarExtra, setNewVarExtra] = useState('0.00');

  const { data: taxes } = useQuery({
    queryKey: ['taxes'],
    queryFn: () => api.get('/taxes', { params: { pageSize: 100 } }).then((r) => r.data.data),
  });

  const { data: product, isLoading: productLoading } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get(`/products/${id}`).then((r) => r.data),
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
      type: 'SERVICE',
      salesPrice: '1000.00',
      costPrice: '0.00',
      defaultTaxId: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        type: product.type,
        salesPrice: product.salesPrice,
        costPrice: product.costPrice,
        defaultTaxId: product.defaultTax?.id || '',
        notes: product.notes || '',
      });
      setVariants(product.variants || []);
    }
  }, [product, reset]);

  const saveMutation = useMutation({
    mutationFn: async (formValues) => {
      const payload = {
        ...formValues,
        defaultTaxId: formValues.defaultTaxId ? formValues.defaultTaxId : null,
      };
      if (isEdit) {
        return api.patch(`/products/${id}`, payload);
      }
      const res = await api.post('/products', payload);
      // If newly created, add any prepared variants
      if (variants.length > 0) {
        for (const v of variants) {
          await api.post(`/products/${res.data.id}/variants`, v);
        }
      }
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      enqueueSnackbar(isEdit ? 'Product updated' : 'Product created', { variant: 'success' });
      navigate('/app/products');
    },
    onError: (err) => {
      const e = toApiError(err);
      enqueueSnackbar(e.message, { variant: 'error' });
    },
  });

  const handleAddVariant = async () => {
    if (!newVarAttr || !newVarVal) {
      enqueueSnackbar('Attribute and Value are required for a variant', { variant: 'warning' });
      return;
    }
    const newV = {
      attribute: newVarAttr,
      value: newVarVal,
      extraPrice: Number(newVarExtra || 0).toFixed(2),
    };

    if (isEdit) {
      try {
        const res = await api.post(`/products/${id}/variants`, newV);
        setVariants([...variants, res.data]);
        enqueueSnackbar('Variant added', { variant: 'success' });
      } catch (err) {
        enqueueSnackbar(toApiError(err).message, { variant: 'error' });
      }
    } else {
      setVariants([...variants, newV]);
    }
    setNewVarVal('');
    setNewVarExtra('0.00');
  };

  const handleRemoveVariant = (index) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  if (isEdit && productLoading) {
    return <LoadingBlock message="Loading product details..." />;
  }

  return (
    <Box component="form" onSubmit={handleSubmit((d) => saveMutation.mutate(d))} noValidate>
      <PageHeader
        title={isEdit ? `Edit Product: ${product?.name || ''}` : 'New Product'}
        subtitle="Manage product sales pricing, tax category, and variant price surcharges"
        action={
          <Button
            startIcon={<ArrowBackIcon />}
            variant="outlined"
            onClick={() => navigate('/app/products')}
          >
            Back to Products
          </Button>
        }
      />

      <Grid container spacing={3}>
        {/* Main Details */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Product Details
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={3}>
                Basic catalog information and sales price
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Product Name *"
                    size="small"
                    {...register('name', { required: 'Product name is required' })}
                    error={Boolean(errors.name)}
                    helperText={errors.name?.message}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label="Type *"
                    size="small"
                    defaultValue="SERVICE"
                    {...register('type')}
                  >
                    <MenuItem value="SERVICE">Service</MenuItem>
                    <MenuItem value="GOODS">Goods</MenuItem>
                    <MenuItem value="ADDON">Add-on</MenuItem>
                  </TextField>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    select
                    label="Default Tax"
                    size="small"
                    defaultValue=""
                    {...register('defaultTaxId')}
                  >
                    <MenuItem value="">None</MenuItem>
                    {(taxes || []).map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.name} ({t.rate}%)
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Sales Price (₹) *"
                    size="small"
                    type="number"
                    inputProps={{ step: '0.01', min: '0' }}
                    {...register('salesPrice', { required: 'Sales price is required' })}
                    error={Boolean(errors.salesPrice)}
                    helperText={errors.salesPrice?.message}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Cost Price (₹)"
                    size="small"
                    type="number"
                    inputProps={{ step: '0.01', min: '0' }}
                    {...register('costPrice')}
                  />
                </Grid>

                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Internal Notes"
                    size="small"
                    multiline
                    rows={3}
                    placeholder="E.g. Brightloop connector SLA terms"
                    {...register('notes')}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Variants Sub-table */}
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Product Variants
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Add attribute extras (e.g. Brand: Odoo +₹560.00)
              </Typography>

              {/* Add Variant Controls */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  size="small"
                  label="Attribute"
                  value={newVarAttr}
                  onChange={(e) => setNewVarAttr(e.target.value)}
                  sx={{ width: 110 }}
                />
                <TextField
                  size="small"
                  label="Value"
                  placeholder="e.g. Odoo"
                  value={newVarVal}
                  onChange={(e) => setNewVarVal(e.target.value)}
                  sx={{ flex: 1 }}
                />
                <TextField
                  size="small"
                  label="+₹ Extra"
                  type="number"
                  inputProps={{ step: '0.01' }}
                  value={newVarExtra}
                  onChange={(e) => setNewVarExtra(e.target.value)}
                  sx={{ width: 100 }}
                />
                <Button
                  variant="outlined"
                  onClick={handleAddVariant}
                  sx={{ minWidth: 40, px: 1.5 }}
                >
                  <AddIcon />
                </Button>
              </Box>

              <Divider sx={{ my: 1.5 }} />

              {/* Variant Rows Table */}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Attribute</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      + Extra (₹)
                    </TableCell>
                    <TableCell align="right" sx={{ width: 40 }}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {variants.length > 0 ? (
                    variants.map((v, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{v.attribute}</TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>{v.value}</TableCell>
                        <TableCell align="right">+{formatMoney(v.extraPrice)}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveVariant(idx)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 2, color: 'text.secondary' }}>
                        No variants added yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Save Button Bar */}
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button variant="outlined" onClick={() => navigate('/app/products')}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={saveMutation.isPending}
          sx={{ minWidth: 140 }}
        >
          {saveMutation.isPending ? <CircularProgress size={24} /> : 'Save Product'}
        </Button>
      </Box>
    </Box>
  );
}

