import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  Stepper,
  Step,
  StepLabel,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  IconButton,
  Tabs,
  Tab,
  TextField,
  MenuItem,
  Divider,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { api, toApiError } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import Money from '../../components/Money';
import ConfirmDialog from '../../components/ConfirmDialog';
import LoadingBlock from '../../components/LoadingBlock';
import ErrorState from '../../components/ErrorState';
import { formatDate, formatDateTime, formatMoney } from '../../utils/format';

const STEPS = ['DRAFT', 'QUOTATION', 'CONFIRMED', 'ACTIVE', 'CLOSED'];

const ACTION_LABELS = {
  send_quote: { label: 'Send Quotation', color: 'info' },
  confirm: { label: 'Confirm Quote', color: 'secondary' },
  activate: { label: 'Activate', color: 'success' },
  pause: { label: 'Pause Subscription', color: 'warning' },
  resume: { label: 'Resume Subscription', color: 'success' },
  renew: { label: 'Renew Contract', color: 'primary' },
  revise: { label: 'Revise (Back to Draft)', color: 'default' },
  close: { label: 'Close Subscription', color: 'error', isDestructive: true },
  cancel: { label: 'Cancel Agreement', color: 'error', isDestructive: true },
};

export default function SubscriptionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState(0);
  const [confirmAction, setConfirmAction] = useState(null);

  // New Line state
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [lineQty, setLineQty] = useState(1);

  const {
    data: sub,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['subscription', id],
    queryFn: () => api.get(`/subscriptions/${id}`).then((r) => r.data),
  });

  const { data: subInvoices } = useQuery({
    queryKey: ['invoices', { subscriptionId: id }],
    queryFn: () => api.get('/invoices', { params: { subscriptionId: id } }).then((r) => r.data),
    enabled: Boolean(sub),
  });

  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: () =>
      api.get('/products', { params: { pageSize: 100, active: 'true' } }).then((r) => r.data),
  });

  const transitionMutation = useMutation({
    mutationFn: (action) => api.post(`/subscriptions/${id}/transition`, { action }),
    onSuccess: (res, action) => {
      qc.invalidateQueries({ queryKey: ['subscription', id] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      enqueueSnackbar(`Subscription transitioned to ${res.data.status}`, { variant: 'success' });
      setConfirmAction(null);
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
      setConfirmAction(null);
    },
  });

  const { data: history } = useQuery({
    queryKey: ['subscription-history', id],
    queryFn: () => api.get(`/subscriptions/${id}/history`, { params: { pageSize: 100 } }).then((r) => r.data),
    enabled: activeTab === 1,
  });

  // Lines are saved on the server; it returns the subscription with a fresh price preview.
  const onLinesSaved = (res, msg) => {
    qc.setQueryData(['subscription', id], res.data);
    qc.invalidateQueries({ queryKey: ['subscriptions'] });
    enqueueSnackbar(msg, { variant: 'success' });
  };

  const addLineMutation = useMutation({
    mutationFn: (body) => api.post(`/subscriptions/${id}/lines`, body),
    onSuccess: (res) => {
      onLinesSaved(res, 'Line added');
      setSelectedProduct('');
      setSelectedVariant('');
      setLineQty(1);
    },
    onError: (err) => enqueueSnackbar(toApiError(err).message, { variant: 'error' }),
  });

  const removeLineMutation = useMutation({
    mutationFn: (lineId) => api.delete(`/subscriptions/${id}/lines/${lineId}`),
    onSuccess: (res) => onLinesSaved(res, 'Line removed'),
    onError: (err) => enqueueSnackbar(toApiError(err).message, { variant: 'error' }),
  });

  const billNowMutation = useMutation({
    mutationFn: () => api.post(`/subscriptions/${id}/invoice`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['subscription', id] });
      enqueueSnackbar(
        res.data.invoicesCreated > 0
          ? `${res.data.invoicesCreated} invoice(s) generated`
          : 'Nothing due to bill yet',
        { variant: res.data.invoicesCreated > 0 ? 'success' : 'info' }
      );
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
    },
  });

  const handleActionClick = (action) => {
    const config = ACTION_LABELS[action];
    if (config?.isDestructive) {
      setConfirmAction(action);
    } else {
      transitionMutation.mutate(action);
    }
  };

  const isLinesEditable = sub?.status === 'DRAFT' || sub?.status === 'QUOTATION';

  const currentProductObj = (products?.data || []).find((p) => p.id === selectedProduct);
  const availableVariants = currentProductObj?.variants || [];

  const handleAddLine = () => {
    if (!currentProductObj) {
      enqueueSnackbar('Select a product to add', { variant: 'warning' });
      return;
    }
    addLineMutation.mutate({
      productId: currentProductObj.id,
      ...(selectedVariant ? { variantId: selectedVariant } : {}),
      quantity: Number(lineQty || 1),
    });
  };

  const handleRemoveLine = (line) => removeLineMutation.mutate(line.id);

  if (isLoading) {
    return <LoadingBlock message="Loading subscription agreement..." />;
  }

  if (error || !sub) {
    return <ErrorState message="Subscription not found." onRetry={refetch} />;
  }

  // Stepper calculations
  let activeStep = STEPS.indexOf(sub.status);
  if (sub.status === 'PAUSED') activeStep = 3; // Paused sits alongside Active

  return (
    <Box>
      <PageHeader
        title={`${sub.number} — ${sub.customer?.name || 'Customer'}`}
        subtitle={`${sub.plan?.name} (${sub.plan?.billingPeriod})`}
        action={
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button
              startIcon={<ArrowBackIcon />}
              variant="outlined"
              onClick={() => navigate('/app/subscriptions')}
            >
              Back
            </Button>
            {sub.status === 'ACTIVE' && (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<ReceiptIcon />}
                disabled={billNowMutation.isPending}
                onClick={() => billNowMutation.mutate()}
              >
                Bill Now
              </Button>
            )}
          </Box>
        }
      />

      {/* Status Stepper Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Agreement Status:
              </Typography>
              <StatusChip status={sub.status} />
              {sub.status === 'PAUSED' && (
                <Chip
                  size="small"
                  label="Billing Paused"
                  color="warning"
                  variant="outlined"
                  sx={{ fontWeight: 600 }}
                />
              )}
            </Box>

            {/* Dynamic Action Buttons from allowedActions */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {(sub.allowedActions || []).map((action) => {
                const cfg = ACTION_LABELS[action] || { label: action, color: 'primary' };
                return (
                  <Button
                    key={action}
                    variant={cfg.isDestructive ? 'outlined' : 'contained'}
                    color={cfg.color}
                    size="small"
                    disabled={transitionMutation.isPending}
                    onClick={() => handleActionClick(action)}
                    sx={{ fontWeight: 600 }}
                  >
                    {cfg.label}
                  </Button>
                );
              })}
            </Box>
          </Box>

          <Stepper activeStep={activeStep} alternativeLabel>
            {STEPS.map((step) => (
              <Step key={step}>
                <StepLabel>{step}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Left Column: Lines & Totals */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6" fontWeight={600}>
                    Subscription Lines
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {isLinesEditable
                      ? 'Add or remove line items'
                      : 'Lines locked after quotation confirmation'}
                  </Typography>
                </Box>
              </Box>

              {/* Add Line Controls (Only if Editable) */}
              {isLinesEditable && (
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
                    sx={{ flex: 1.5, minWidth: 140 }}
                  >
                    {(products?.data || []).map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.name} ({formatMoney(p.salesPrice)})
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
                        {v.attribute}: {v.value} (+{formatMoney(v.extraPrice)})
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

                  <Button
                    variant="outlined"
                    aria-label="Add line"
                    disabled={addLineMutation.isPending}
                    onClick={handleAddLine}
                    sx={{ minWidth: 40, px: 1.5 }}
                  >
                    <AddIcon />
                  </Button>
                </Box>
              )}

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
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Tax
                    </TableCell>
                    {isLinesEditable && <TableCell sx={{ width: 40 }}></TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(sub.lines || []).map((line, idx) => {
                    return (
                      <TableRow key={line.id || idx}>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600}>
                            {line.product?.name || 'Item'}
                          </Typography>
                          {line.variant && (
                            <Typography variant="caption" color="text.secondary">
                              {line.variant.attribute}: {line.variant.value}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">{line.quantity}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                          <Money value={line.unitPrice} />
                        </TableCell>
                        <TableCell align="right">
                          {line.tax?.name ? `${line.tax.name}` : '—'}
                        </TableCell>
                        {isLinesEditable && (
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              color="error"
                              aria-label="Remove line"
                              disabled={removeLineMutation.isPending}
                              onClick={() => handleRemoveLine(line)}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Server Preview Totals Box */}
              <Box sx={{ mt: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={1}>
                  ESTIMATED RECURRING PREVIEW (PER BILLING PERIOD)
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Subtotal:
                    </Typography>
                  </Grid>
                  <Grid item xs={6} textAlign="right">
                    <Typography variant="body2" fontWeight={600}>
                      <Money value={sub.preview?.subtotal || '0.00'} />
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      Promotional Discounts:
                    </Typography>
                  </Grid>
                  <Grid item xs={6} textAlign="right">
                    <Typography variant="body2" color="secondary.main" fontWeight={600}>
                      <Money sign="-" hideZeroSign value={sub.preview?.discountTotal || '0.00'} />
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" color="text.secondary">
                      GST Taxes:
                    </Typography>
                  </Grid>
                  <Grid item xs={6} textAlign="right">
                    <Typography variant="body2" fontWeight={600}>
                      <Money sign="+" hideZeroSign value={sub.preview?.taxTotal || '0.00'} />
                    </Typography>
                  </Grid>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 0.5 }} />
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      Estimated Recurring Total:
                    </Typography>
                  </Grid>
                  <Grid item xs={6} textAlign="right">
                    <Typography variant="h6" fontWeight={800} color="primary.main">
                      <Money value={sub.preview?.total || sub.recurringTotal || '0.00'} />
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            </CardContent>
          </Card>

          {/* Bottom Tabs: Invoices & History */}
          <Card>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={activeTab} onChange={(_e, v) => setActiveTab(v)}>
                <Tab label="Invoices Billed" sx={{ fontWeight: 600, textTransform: 'none' }} />
                <Tab label="Status History" sx={{ fontWeight: 600, textTransform: 'none' }} />
              </Tabs>
            </Box>
            <CardContent sx={{ p: 2.5 }}>
              {activeTab === 0 && (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Invoice #</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>
                        Status
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        Total
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        Balance
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(subInvoices?.data || []).length > 0 ? (
                      subInvoices.data.map((inv) => (
                        <TableRow
                          key={inv.id}
                          hover
                          sx={{ cursor: 'pointer' }}
                          onClick={() => navigate(`/app/invoices/${inv.id}`)}
                        >
                          <TableCell sx={{ fontWeight: 600, color: 'primary.main' }}>
                            {inv.number}
                          </TableCell>
                          <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                          <TableCell align="center">
                            <StatusChip status={inv.status} overdue={inv.isOverdue} />
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            <Money value={inv.total} />
                          </TableCell>
                          <TableCell align="right">
                            <Money value={inv.balanceDue} />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          No invoices issued for this agreement yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}

              {activeTab === 1 && (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>When</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Change</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>By</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(history?.data || []).length > 0 ? (
                      history.data.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell>{formatDateTime(h.changedAt)}</TableCell>
                          <TableCell>
                            {h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : `Created as ${h.toStatus}`}
                          </TableCell>
                          <TableCell>{h.changedBy?.name || 'Billing job'}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                          No status changes recorded yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Right Column: Terms & Metadata */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Agreement Terms
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    CUSTOMER ACCOUNT
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {sub.customer?.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {sub.customer?.email}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    BILLING PLAN
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {sub.plan?.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Cycle: {sub.plan?.billingPeriod}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    START DATE
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {formatDate(sub.startDate)}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    NEXT BILLING DATE
                  </Typography>
                  <Typography variant="body2" fontWeight={600} color="primary.main">
                    {sub.nextBillingDate ? formatDate(sub.nextBillingDate) : 'Not scheduled'}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="caption" color="text.secondary">
                    PAYMENT TERMS
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {sub.paymentTermsDays} Days Net
                  </Typography>
                </Box>

                {sub.quotationValidUntil && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      QUOTE VALID UNTIL
                    </Typography>
                    <Typography variant="body2" fontWeight={600} color="warning.main">
                      {formatDate(sub.quotationValidUntil)}
                    </Typography>
                  </Box>
                )}

                {sub.notes && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      AGREEMENT NOTES
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', bgcolor: '#f8fafc', p: 1, borderRadius: 1 }}>
                      {sub.notes}
                    </Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Confirmation Dialog for Destructive Actions */}
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction ? ACTION_LABELS[confirmAction]?.label : ''}
        content={`Are you sure you want to ${confirmAction} this subscription? This will update its lifecycle status.`}
        confirmLabel="Proceed"
        confirmColor="error"
        loading={transitionMutation.isPending}
        onConfirm={() => transitionMutation.mutate(confirmAction)}
        onClose={() => setConfirmAction(null)}
      />
    </Box>
  );
}

