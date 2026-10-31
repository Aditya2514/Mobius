import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Grid,
  Chip,
  Divider,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { api, toApiError } from '../../api/client';
import StatusChip from '../../components/StatusChip';
import Money from '../../components/Money';
import ConfirmDialog from '../../components/ConfirmDialog';
import LoadingBlock from '../../components/LoadingBlock';
import EmptyState from '../../components/EmptyState';
import { formatDate } from '../../utils/format';

const PORTAL_ACTION_LABELS = {
  pause: { label: 'Pause Subscription', color: 'warning' },
  resume: { label: 'Resume Subscription', color: 'success' },
  close: { label: 'Cancel Subscription', color: 'error', isDestructive: true },
};

export default function MySubscriptionsPage() {
  const qc = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [confirmSub, setConfirmSub] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const { data: subs, isLoading } = useQuery({
    queryKey: ['portal', 'subscriptions'],
    queryFn: () => api.get('/subscriptions').then((r) => r.data),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ subId, action }) =>
      api.post(`/subscriptions/${subId}/transition`, { action }),
    onSuccess: (res, variables) => {
      qc.invalidateQueries({ queryKey: ['portal', 'subscriptions'] });
      enqueueSnackbar(`Subscription ${variables.action} successful`, { variant: 'success' });
      setConfirmSub(null);
      setConfirmAction(null);
    },
    onError: (err) => {
      enqueueSnackbar(toApiError(err).message, { variant: 'error' });
      setConfirmSub(null);
      setConfirmAction(null);
    },
  });

  const handleAction = (sub, action) => {
    setConfirmSub(sub);
    setConfirmAction(action);
  };

  if (isLoading) {
    return <LoadingBlock message="Loading your subscriptions..." />;
  }

  const subList = subs?.data || [];

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          My Subscriptions
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Active software services, upcoming billing renewals, and self-service controls
        </Typography>
      </Box>

      {subList.length > 0 ? (
        <Grid container spacing={3}>
          {subList.map((sub) => {
            const customerActions = (sub.allowedActions || []).filter((a) =>
              ['pause', 'resume', 'close'].includes(a)
            );

            return (
              <Grid item xs={12} key={sub.id}>
                <Card sx={{ border: '1px solid rgba(255,255,255,0.10)', borderRadius: 3 }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                          <Typography variant="h6" fontWeight={700}>
                            {sub.plan?.name || 'Recurring Service'}
                          </Typography>
                          <StatusChip status={sub.status} />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          Agreement #{sub.number} • Billing Cycle: {sub.plan?.billingPeriod}
                        </Typography>
                      </Box>

                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" color="text.secondary" display="block">
                          RECURRING RATE
                        </Typography>
                        <Typography variant="h6" fontWeight={800} color="primary.main">
                          <Money value={sub.recurringTotal} />
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                            /{sub.plan?.billingPeriod?.toLowerCase()}
                          </Typography>
                        </Typography>
                      </Box>
                    </Box>

                    <Divider sx={{ my: 2 }} />

                    <Grid container spacing={2} sx={{ mb: 2.5 }}>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                          STARTED ON
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {formatDate(sub.startDate)}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                          NEXT BILLING
                        </Typography>
                        <Typography variant="body2" fontWeight={600} color="primary.main">
                          {sub.nextBillingDate ? formatDate(sub.nextBillingDate) : '—'}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                          PAYMENT TERMS
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {sub.paymentTermsDays || 15} Days Net
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">
                          CONTRACT EXPIRY
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {sub.expiryDate ? formatDate(sub.expiryDate) : 'Auto-renewing'}
                        </Typography>
                      </Grid>
                    </Grid>

                    {/* Self Service Actions */}
                    {customerActions.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', pt: 1 }}>
                        {customerActions.map((action) => {
                          const cfg = PORTAL_ACTION_LABELS[action] || {
                            label: action,
                            color: 'primary',
                          };
                          return (
                            <Button
                              key={action}
                              size="small"
                              variant={cfg.isDestructive ? 'outlined' : 'contained'}
                              color={cfg.color}
                              onClick={() => handleAction(sub, action)}
                            >
                              {cfg.label}
                            </Button>
                          );
                        })}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      ) : (
        <EmptyState
          title="No active subscriptions"
          description="You do not currently have any active software subscriptions on file."
        />
      )}

      {/* Action Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(confirmSub && confirmAction)}
        title={confirmAction ? PORTAL_ACTION_LABELS[confirmAction]?.label : ''}
        content={`Are you sure you want to ${confirmAction} subscription ${confirmSub?.number}?`}
        confirmLabel="Confirm"
        confirmColor={confirmAction === 'close' ? 'error' : 'primary'}
        loading={transitionMutation.isPending}
        onConfirm={() =>
          transitionMutation.mutate({
            subId: confirmSub?.id,
            action: confirmAction,
          })
        }
        onClose={() => {
          setConfirmSub(null);
          setConfirmAction(null);
        }}
      />
    </Box>
  );
}

