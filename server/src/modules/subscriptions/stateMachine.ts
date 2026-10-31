import type { subscription_status } from '@prisma/client';
import { AppError } from '../../lib/errors';
import type { Role } from '../../middleware/auth';

export type SubStatus = subscription_status;

/** The only legal subscription status changes. Every change goes through nextStatus(). */
export const T = {
  DRAFT:     { send_quote: 'QUOTATION', cancel: 'CLOSED' },
  QUOTATION: { confirm: 'CONFIRMED', revise: 'DRAFT', cancel: 'CLOSED' },
  CONFIRMED: { activate: 'ACTIVE' },
  ACTIVE:    { pause: 'PAUSED', close: 'CLOSED', renew: 'ACTIVE' },
  PAUSED:    { resume: 'ACTIVE', close: 'CLOSED' },
  CLOSED:    {},
} as const satisfies Record<SubStatus, Record<string, SubStatus>>;

export const ACTIONS = ['send_quote', 'confirm', 'revise', 'activate', 'pause', 'resume', 'close', 'renew', 'cancel'] as const;
export type Action = (typeof ACTIONS)[number];

/** Actions a customer may take on their own subscription (if the plan allows). */
export const CUSTOMER_ACTIONS: readonly Action[] = ['pause', 'resume', 'close'];

export function nextStatus(from: SubStatus, action: string): SubStatus {
  const to = (T[from] as Record<string, SubStatus>)[action];
  if (!to) {
    throw new AppError(400, 'INVALID_TRANSITION', `Cannot ${action} from ${from}`, { allowed: Object.keys(T[from]) });
  }
  return to;
}

type SubFlags = { status: SubStatus; expiry_date: Date | null };
type PlanFlags = { is_pausable: boolean; is_closable: boolean; is_renewable: boolean };

/** What the UI may show: state machine ∩ plan flags ∩ role. */
export function allowedActions(sub: SubFlags, plan: PlanFlags, role: Role): Action[] {
  return (Object.keys(T[sub.status]) as Action[]).filter((a) => {
    if (a === 'pause' && !plan.is_pausable) return false;
    if (a === 'close' && !plan.is_closable) return false;
    if (a === 'renew' && (!plan.is_renewable || !sub.expiry_date)) return false; // nothing to extend without an expiry
    if (role === 'CUSTOMER') return CUSTOMER_ACTIONS.includes(a);
    return true;
  });
}
