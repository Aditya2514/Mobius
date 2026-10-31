import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import invoiceRoutes from './modules/billing/invoice.routes';
import productRoutes from './modules/catalog/products.routes';
import taxRoutes from './modules/catalog/taxes.routes';
import variantRoutes from './modules/catalog/variants.routes';
import customerRoutes from './modules/customers/customer.routes';
import discountRoutes from './modules/discounts/discount.routes';
import planRoutes from './modules/plans/plan.routes';
import templateRoutes from './modules/quotations/template.routes';
import subscriptionRoutes from './modules/subscriptions/subscription.routes';
import userRoutes from './modules/users/user.routes';

/** Mounted at /api/v1. Each module router declares its own full paths. */
export const routes = Router();

routes.get('/health', (_req, res) => {
  res.json({ ok: true });
});

routes.use(authRoutes);
routes.use(userRoutes);
routes.use(customerRoutes);
routes.use(taxRoutes);
routes.use(productRoutes);
routes.use(variantRoutes);
routes.use(planRoutes);
routes.use(templateRoutes);
routes.use(subscriptionRoutes);
routes.use(discountRoutes);
routes.use(invoiceRoutes);
