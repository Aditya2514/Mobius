import React from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Button,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '../../api/client';
import StatCard from '../../components/StatCard';
import PageHeader from '../../components/PageHeader';
import { formatMoney, formatMoneyCompact, formatNumber } from '../../utils/format';
import Money from '../../components/Money';
import LoadingBlock from '../../components/LoadingBlock';
import ErrorState from '../../components/ErrorState';
import SubscriptionsOutlinedIcon from '@mui/icons-material/SubscriptionsOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';

export default function DashboardPage() {
  const navigate = useNavigate();

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => api.get('/reports/summary').then((r) => r.data),
  });

  const { data: revenueMonthly, isLoading: revenueLoading } = useQuery({
    queryKey: ['reports', 'revenue'],
    queryFn: () => api.get('/reports/revenue').then((r) => r.data),
  });

  const { data: subsByPlan, isLoading: subsByPlanLoading } = useQuery({
    queryKey: ['reports', 'subscriptions-by-plan'],
    queryFn: () => api.get('/reports/subscriptions-by-plan').then((r) => r.data),
  });

  const { data: overdueList, isLoading: overdueLoading } = useQuery({
    queryKey: ['reports', 'overdue'],
    queryFn: () => api.get('/reports/overdue', { params: { pageSize: 10 } }).then((r) => r.data),
  });

  if (summaryLoading || revenueLoading || subsByPlanLoading || overdueLoading) {
    return <LoadingBlock message="Loading finance analytics..." />;
  }

  if (summaryError) {
    return <ErrorState message="Could not load dashboard data." onRetry={refetchSummary} />;
  }

  const chartData = (revenueMonthly || []).map((item) => ({
    name: item.month,
    Amount: Number(item.amount),
  }));

  return (
    <Box>
      <PageHeader
        title="Finance & Subscriptions Dashboard"
        subtitle="Brightloop SaaS revenue, active accounts, and cash collections"
      />

      {/* 5 KPI Metric Cards */}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Active Subscriptions"
            value={formatNumber(summary?.activeSubscriptions)}
            subtitle="Across all recurring plans"
            icon={<SubscriptionsOutlinedIcon />}
            color="#4f46e5"
            onClick={() => navigate('/app/subscriptions?status=ACTIVE')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Monthly Revenue"
            value={<Money compact value={summary?.revenueThisMonth} />}
            subtitle="Cash collected this month"
            icon={<AccountBalanceWalletOutlinedIcon />}
            color="#16a34a"
            onClick={() => navigate('/app/payments')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Total Outstanding"
            value={<Money compact value={summary?.outstanding} />}
            subtitle="Confirmed unpaid invoices"
            icon={<PendingActionsOutlinedIcon />}
            color="#0284c7"
            onClick={() => navigate('/app/invoices?status=CONFIRMED')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Overdue Balance"
            value={<Money compact value={summary?.overdueAmount} />}
            subtitle={`${formatNumber(summary?.overdueCount ?? 0)} invoices past due`}
            icon={<WarningAmberOutlinedIcon />}
            color="#dc2626"
            onClick={() => navigate('/app/invoices?overdue=true')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            title="Normalized MRR"
            value={<Money compact value={summary?.mrr} />}
            subtitle="Monthly recurring revenue"
            icon={<TrendingUpOutlinedIcon />}
            color="#7c3aed"
          />
        </Grid>
      </Grid>

      {/* Charts & Breakdown Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Revenue by Month Bar Chart */}
        <Grid item xs={12} lg={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Revenue Trend (Last 12 Months)
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Cash basis collections by month (INR)
              </Typography>
              <Box sx={{ width: '100%', height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={12}
                      tickLine={false}
                      tickFormatter={(val) => formatMoneyCompact(val, 1)}
                    />
                    <Tooltip
                      formatter={(val) => [
                        formatMoney(val),
                        'Revenue',
                      ]}
                    />
                    <Bar dataKey="Amount" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Subscriptions by Plan */}
        <Grid item xs={12} lg={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Active Subscriptions by Plan
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Distribution and recurring MRR share
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Plan</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Active
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      MRR
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(subsByPlan || []).map((row) => (
                    <TableRow key={row.planId} hover>
                      <TableCell sx={{ fontWeight: 500 }}>{row.planName}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatNumber(row.active)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        <Money value={row.mrr} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Top 10 Overdue Invoices Table */}
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography variant="h6" fontWeight={600}>
                Overdue Invoices Requiring Follow-Up
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Confirmed invoices with unpaid balance past their due date
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              onClick={() => navigate('/app/invoices?overdue=true')}
            >
              View All Invoices
            </Button>
          </Box>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Invoice #</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Customer</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Due Date</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>
                  Days Overdue
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  Balance Due
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {overdueList?.data?.length ? (
                overdueList.data.map((inv) => (
                  <TableRow
                    key={inv.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/app/invoices/${inv.id}`)}
                  >
                    <TableCell sx={{ fontWeight: 600, color: 'primary.main' }}>
                      {inv.number}
                    </TableCell>
                    <TableCell>{inv.billToName}</TableCell>
                    <TableCell>{inv.dueDate}</TableCell>
                    <TableCell align="center">
                      <Typography variant="caption" color="error.main" fontWeight={600}>
                        {inv.daysOverdue} days
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>
                      <Money value={inv.balanceDue} />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No overdue invoices at this time.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Box>
  );
}

