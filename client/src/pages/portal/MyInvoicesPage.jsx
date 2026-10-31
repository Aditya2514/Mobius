import React from 'react';
import { Box, Card, Typography, Table, TableHead, TableRow, TableCell, TableBody, Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { api } from '../../api/client';
import StatusChip from '../../components/StatusChip';
import Money from '../../components/Money';
import LoadingBlock from '../../components/LoadingBlock';
import EmptyState from '../../components/EmptyState';
import { formatDate } from '../../utils/format';
import { exportInvoicePdf } from '../../utils/pdf';

export default function MyInvoicesPage() {
  const navigate = useNavigate();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['portal', 'invoices'],
    queryFn: () => api.get('/invoices').then((r) => r.data),
  });

  if (isLoading) {
    return <LoadingBlock message="Loading your invoices..." />;
  }

  const invoiceList = invoices?.data || [];

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          My Invoices
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Statements, payment records, and PDF receipt downloads
        </Typography>
      </Box>

      {invoiceList.length > 0 ? (
        <Card sx={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: 3 }}>
          <Table>
            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.04)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Invoice #</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Invoice Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Due Date</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Status
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  Total (₹)
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  Balance (₹)
                </TableCell>
                <TableCell align="right" sx={{ width: 140 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoiceList.map((inv) => (
                <TableRow
                  key={inv.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                >
                  <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {inv.number}
                  </TableCell>
                  <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                  <TableCell sx={{ color: inv.isOverdue ? 'error.main' : 'inherit', fontWeight: inv.isOverdue ? 700 : 400 }}>
                    {formatDate(inv.dueDate)}
                  </TableCell>
                  <TableCell align="center">
                    <StatusChip status={inv.status} overdue={inv.isOverdue} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    <Money value={inv.total} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: inv.isOverdue ? 'error.main' : 'inherit' }}>
                    <Money value={inv.balanceDue} />
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PictureAsPdfOutlinedIcon />}
                      onClick={() => exportInvoicePdf(inv)}
                    >
                      PDF
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <EmptyState
          title="No invoices found"
          description="You do not have any invoices or statements on your account yet."
        />
      )}
    </Box>
  );
}

