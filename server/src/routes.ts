import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import invoiceRoutes from './modules/billing/invoice.routes';
import customerRoutes from './modules/customers/customer.routes';
import discountRoutes from './modules/discounts/discount.routes';
import userRoutes from './modules/users/user.routes';

/** Mounted at /api/v1. Each module router declares its own full paths. */
export const routes = Router();

routes.get('/health', (_req, res) => {
  res.json({ ok: true });
});

routes.use(authRoutes);
routes.use(userRoutes);
routes.use(customerRoutes);
routes.use(discountRoutes);
routes.use(invoiceRoutes);
