import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { useAuth, homeFor } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import AuthLayout from './layouts/AuthLayout';
import AppLayout from './layouts/AppLayout';
import PortalLayout from './layouts/PortalLayout';

import LoginPage from './pages/auth/LoginPage';
import SignupPage from './pages/auth/SignupPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';

import DashboardPage from './pages/dashboard/DashboardPage';
import CustomersPage from './pages/customers/CustomersPage';
import ProductsPage from './pages/products/ProductsPage';
import ProductFormPage from './pages/products/ProductFormPage';
import PlansPage from './pages/plans/PlansPage';
import PlanFormPage from './pages/plans/PlanFormPage';
import TaxesPage from './pages/taxes/TaxesPage';
import TemplatesPage from './pages/templates/TemplatesPage';
import TemplateFormPage from './pages/templates/TemplateFormPage';
import SubscriptionsPage from './pages/subscriptions/SubscriptionsPage';
import SubscriptionCreatePage from './pages/subscriptions/SubscriptionCreatePage';
import SubscriptionDetailPage from './pages/subscriptions/SubscriptionDetailPage';
import DiscountsPage from './pages/discounts/DiscountsPage';
import DiscountFormPage from './pages/discounts/DiscountFormPage';
import InvoicesPage from './pages/invoices/InvoicesPage';
import InvoiceDetailPage from './pages/invoices/InvoiceDetailPage';
import PaymentsPage from './pages/payments/PaymentsPage';
import BillingRunsPage from './pages/billing/BillingRunsPage';
import UsersPage from './pages/users/UsersPage';

import MySubscriptionsPage from './pages/portal/MySubscriptionsPage';
import MyInvoicesPage from './pages/portal/MyInvoicesPage';
import MyInvoiceDetailPage from './pages/portal/MyInvoiceDetailPage';
import ProfilePage from './pages/portal/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';
import RouteError from './components/RouteError';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={homeFor(user.role)} replace />;
}

export const router = createBrowserRouter([
  // Public Auth Routes
  {
    element: <AuthLayout />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
  },

  // Back Office (Admin & Staff) Routes
  {
    element: <ProtectedRoute roles={['ADMIN', 'STAFF']} />,
    children: [
      {
        path: '/app',
        element: <AppLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'subscriptions', element: <SubscriptionsPage /> },
          { path: 'subscriptions/new', element: <SubscriptionCreatePage /> },
          { path: 'subscriptions/:id', element: <SubscriptionDetailPage /> },
          { path: 'invoices', element: <InvoicesPage /> },
          { path: 'invoices/:id', element: <InvoiceDetailPage /> },
          { path: 'payments', element: <PaymentsPage /> },
          { path: 'products', element: <ProductsPage /> },
          { path: 'plans', element: <PlansPage /> },
          { path: 'templates', element: <TemplatesPage /> },
          { path: 'discounts', element: <DiscountsPage /> },

          // Strict Admin-Only Routes
          {
            element: <ProtectedRoute roles={['ADMIN']} />,
            children: [
              { path: 'products/new', element: <ProductFormPage /> },
              { path: 'products/:id/edit', element: <ProductFormPage /> },
              { path: 'plans/new', element: <PlanFormPage /> },
              { path: 'plans/:id/edit', element: <PlanFormPage /> },
              { path: 'templates/new', element: <TemplateFormPage /> },
              { path: 'templates/:id/edit', element: <TemplateFormPage /> },
              { path: 'discounts/new', element: <DiscountFormPage /> },
              { path: 'discounts/:id/edit', element: <DiscountFormPage /> },
              { path: 'taxes', element: <TaxesPage /> },
              { path: 'users', element: <UsersPage /> },
              { path: 'billing', element: <BillingRunsPage /> },
            ],
          },
        ],
      },
    ],
  },

  // Customer Portal Routes
  {
    element: <ProtectedRoute roles={['CUSTOMER']} />,
    children: [
      {
        path: '/portal',
        element: <PortalLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <MySubscriptionsPage /> },
          { path: 'invoices', element: <MyInvoicesPage /> },
          { path: 'invoices/:id', element: <MyInvoiceDetailPage /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
    ],
  },

  { path: '/', element: <RootRedirect /> },
  { path: '*', element: <NotFoundPage /> },
]);

