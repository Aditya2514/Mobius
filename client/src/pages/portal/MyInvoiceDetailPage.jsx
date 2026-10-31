import React from 'react';
import {
  Box,
  Card,
  Typography,
  Button,
  Grid,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Divider,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { api } from '../../api/client';
import StatusChip from '../../components/StatusChip';
import Money from '../../components/Money';
import LoadingBlock from '../../components/LoadingBlock';
import ErrorState from '../../components/ErrorState';
import { formatDate } from '../../utils/format';
import { exportInvoicePdf } from '../../utils/pdf';

export default function MyInvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const {
    data: invoice,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['portal', 'invoice', id],
    queryFn: () => api.get(`/invoices/${id}`).then((r) => r.data),
  });

  if (isLoading) {
    return <LoadingBlock message="Loading invoice statement..." />;
  }

  if (error || !invoice) {
    return <ErrorState message="Invoice not found or unauthorized." onRetry={refetch} />;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/portal/invoices')}
        >
          Back to Invoices
        </Button>
        <Button
          variant="contained"
          startIcon={<PrintOutlinedIcon />}
          onClick={() => exportInvoicePdf(invoice)}
        >
          Print / Download PDF
        </Button>
      </Box>

      <Card sx={{ p: { xs: 2.5, sm: 4 }, border: '1px solid #e2e8f0', borderRadius: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <Box>
            <Typography variant="h5" fontWeight={800} color="primary.main">
              {invoice.number}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Brightloop Subscription Statement
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <StatusChip status={invoice.status} overdue={invoice.isOverdue} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Date: {formatDate(invoice.invoiceDate)}
            </Typography>
            <Typography
              variant="caption"
              color={invoice.isOverdue ? 'error.main' : 'text.secondary'}
              sx={{ display: 'block', fontWeight: invoice.isOverdue ? 700 : 400 }}
            >
              Due: {formatDate(invoice.dueDate)}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Lines Snapshot */}
        <Table size="small" sx={{ mb: 3 }}>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
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
                <TableCell align="right">
                  <Money value={line.unitPrice} />
                </TableCell>
                <TableCell align="right" sx={{ color: 'secondary.main' }}>
                  {Number(line.discountAmount) > 0 ? `-₹${line.discountAmount}` : '—'}
                </TableCell>
                <TableCell align="right">{line.taxAmount ? `+₹${line.taxAmount}` : '—'}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  <Money value={line.lineTotal} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Summary */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
          <Box sx={{ width: 280 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Subtotal:
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                <Money value={invoice.subtotal} />
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Discount:
              </Typography>
              <Typography variant="body2" color="secondary.main" fontWeight={600}>
                -<Money value={invoice.discountTotal} />
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                GST Tax:
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                +<Money value={invoice.taxTotal} />
              </Typography>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                Total:
              </Typography>
              <Typography variant="h6" fontWeight={800}>
                <Money value={invoice.total} />
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                Paid:
              </Typography>
              <Typography variant="body2" color="success.main" fontWeight={600}>
                <Money value={invoice.amountPaid} />
              </Typography>
            </Box>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
              <Typography variant="subtitle1" fontWeight={800} color={invoice.isOverdue ? 'error.main' : 'text.primary'}>
                Balance Due:
              </Typography>
              <Typography variant="h6" fontWeight={800} color={invoice.isOverdue ? 'error.main' : 'text.primary'}>
                <Money value={invoice.balanceDue} />
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Payments list */}
        {(invoice.payments || []).length > 0 && (
          <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #f1f5f9' }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Payment Receipts:
            </Typography>
            {invoice.payments.map((p) => (
              <Box key={p.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(p.paidOn)} • {p.method} {p.reference ? `(${p.reference})` : ''}
                </Typography>
                <Typography variant="body2" fontWeight={600} color="success.dark">
                  <Money value={p.amount} />
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Card>
    </Box>
  );
}

