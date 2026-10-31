import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Divider,
  Chip,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PaymentIcon from '@mui/icons-material/Payment';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { api, toApiError } from '../../api/client';
import PageHeader from '../../components/PageHeader';
import StatusChip from '../../components/StatusChip';
import Money from '../../components/Money';
import ConfirmDialog from '../../components/ConfirmDialog';
import LoadingBlock from '../../components/LoadingBlock';
import ErrorState from '../../components/ErrorState';
import RecordPaymentDialog from './RecordPaymentDialog';
import { formatDate } from '../../utils/format';
import { exportInvoicePdf } from '../../utils/pdf';

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const {
    data: invoice,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => api.get(`/invoices/${id}`).then((r) => r.data),
  });

  const confirmMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/confirm`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      enqueueSnackbar('Invoice confirmed successfully', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(toApiError(err).message, { variant: 'error' }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      enqueueSnackbar('Invoice cancelled', { variant: 'info' });
      setCancelDialogOpen(false);
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
      setCancelDialogOpen(false);
    },
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/invoices/${id}/send`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      enqueueSnackbar(`Invoice dispatched to ${invoice?.billTo?.email}`, { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(toApiError(err).message, { variant: 'error' }),
  });

  const handlePrint = () => {
    exportInvoicePdf(invoice);
  };

  if (isLoading) {
    return <LoadingBlock message="Loading invoice statement..." />;
  }

  if (error || !invoice) {
    return <ErrorState message="Invoice not found." onRetry={refetch} />;
  }

  const isDraft = invoice.status === 'DRAFT';
  const isConfirmed = invoice.status === 'CONFIRMED';
  const isPaid = invoice.status === 'PAID';
  const canCancel = isDraft || (isConfirmed && Number(invoice.amountPaid) === 0);

  return (
    <Box>
      <PageHeader
        title={`Invoice ${invoice.number}`}
        subtitle={`Issued to ${invoice.billTo?.name || 'Customer'}`}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              startIcon={<ArrowBackIcon />}
              variant="outlined"
              onClick={() => navigate('/app/invoices')}
            >
              Back
            </Button>

            {isDraft && (
              <Button
                variant="contained"
                color="secondary"
                startIcon={<CheckCircleOutlineIcon />}
                disabled={confirmMutation.isPending}
                onClick={() => confirmMutation.mutate()}
              >
                Confirm Invoice
              </Button>
            )}

            {isConfirmed && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<PaymentIcon />}
                  onClick={() => setPaymentDialogOpen(true)}
                >
                  Record Payment
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SendOutlinedIcon />}
                  disabled={sendMutation.isPending}
                  onClick={() => sendMutation.mutate()}
                >
                  {invoice.sentAt ? 'Resend Email' : 'Send by Email'}
                </Button>
              </>
            )}

            {(isConfirmed || isPaid) && (
              <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={handlePrint}>
                Print / PDF
              </Button>
            )}

            {canCancel && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelOutlinedIcon />}
                onClick={() => setCancelDialogOpen(true)}
              >
                Cancel Invoice
              </Button>
            )}
          </Box>
        }
      />

      <Grid container spacing={3}>
        {/* Main Invoice Bill */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ p: { xs: 2, sm: 4 } }}>
            {/* Header info */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
              <Box>
                <Typography variant="h5" fontWeight={800} color="primary.main">
                  {invoice.number}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Agreement: {invoice.subscriptionNumber || 'Standard'}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <StatusChip status={invoice.status} overdue={invoice.isOverdue} />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Invoice Date: {formatDate(invoice.invoiceDate)}
                </Typography>
                <Typography
                  variant="caption"
                  color={invoice.isOverdue ? 'error.main' : 'text.secondary'}
                  sx={{ display: 'block', fontWeight: invoice.isOverdue ? 700 : 400 }}
                >
                  Due Date: {formatDate(invoice.dueDate)}
                </Typography>
              </Box>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Bill To Info */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                BILL TO:
              </Typography>
              <Typography variant="subtitle1" fontWeight={700}>
                {invoice.billTo?.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {invoice.billTo?.email}
              </Typography>
              {invoice.billTo?.address && (
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300, mt: 0.5 }}>
                  {invoice.billTo.address}
                </Typography>
              )}
            </Box>

            {/* Snapshot Line Items */}
            <Table size="small" sx={{ mb: 3 }}>
              <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.04)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Item Description</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>
                    Qty
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Unit Price
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Discount
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Tax
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Amount (₹)
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(invoice.lines || []).map((line, idx) => (
                  <TableRow key={line.id || idx}>
                    <TableCell sx={{ fontWeight: 500 }}>{line.description}</TableCell>
                    <TableCell align="center">{line.quantity}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      <Money value={line.unitPrice} />
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'secondary.main', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(line.discountAmount) > 0 ? <Money sign="-" value={line.discountAmount} /> : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {Number(line.taxAmount) > 0 ? <Money sign="+" value={line.taxAmount} /> : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      <Money value={line.lineTotal} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Financial Summary */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
              <Box sx={{ width: 280 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                  <Typography variant="body2" color="text.secondary">
                    Subtotal:
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    <Money value={invoice.subtotal} />
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                  <Typography variant="body2" color="text.secondary">
                    Discount Total:
                  </Typography>
                  <Typography variant="body2" color="secondary.main" fontWeight={600}>
                    <Money sign="-" hideZeroSign value={invoice.discountTotal} />
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                  <Typography variant="body2" color="text.secondary">
                    Tax Total:
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    <Money sign="+" hideZeroSign value={invoice.taxTotal} />
                  </Typography>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    Invoice Total:
                  </Typography>
                  <Typography variant="h6" fontWeight={800}>
                    <Money value={invoice.total} />
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                  <Typography variant="body2" color="text.secondary">
                    Amount Paid:
                  </Typography>
                  <Typography variant="body2" color="success.main" fontWeight={600}>
                    <Money value={invoice.amountPaid} />
                  </Typography>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75 }}>
                  <Typography variant="subtitle1" fontWeight={800} color={invoice.isOverdue ? 'error.main' : 'text.primary'}>
                    Balance Due:
                  </Typography>
                  <Typography variant="h6" fontWeight={800} color={invoice.isOverdue ? 'error.main' : 'text.primary'}>
                    <Money value={invoice.balanceDue} />
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Card>
        </Grid>

        {/* Right Column: Payments Ledger */}
        <Grid item xs={12} lg={4}>
          <Card>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Payment History
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Recorded transactions for this invoice
              </Typography>
              <Divider sx={{ mb: 2 }} />

              {(invoice.payments || []).length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {invoice.payments.map((p) => (
                    <Box
                      key={p.id}
                      sx={{
                        p: 1.5,
                        bgcolor: 'rgba(255,255,255,0.04)',
                        borderRadius: 2,
                        border: '1px solid rgba(255,255,255,0.10)',
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Chip size="small" label={p.method} color="primary" variant="outlined" />
                        <Typography variant="body2" fontWeight={700} color="success.dark">
                          <Money sign="+" hideZeroSign value={p.amount} />
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Paid on: {formatDate(p.paidOn)}
                      </Typography>
                      {p.reference && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Ref: {p.reference}
                        </Typography>
                      )}
                      {p.note && (
                        <Typography variant="caption" fontStyle="italic" display="block">
                          {p.note}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  No payments recorded yet.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Payment Recording Dialog */}
      <RecordPaymentDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        invoice={invoice}
      />

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={cancelDialogOpen}
        title="Cancel Invoice?"
        content={`Are you sure you want to cancel ${invoice.number}? This cannot be undone.`}
        confirmLabel="Cancel Invoice"
        confirmColor="error"
        loading={cancelMutation.isPending}
        onConfirm={() => cancelMutation.mutate()}
        onClose={() => setCancelDialogOpen(false)}
      />
    </Box>
  );
}

