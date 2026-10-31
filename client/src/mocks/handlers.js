// client/src/mocks/handlers.js
import { http, HttpResponse, delay } from 'msw';
import {
  mockUsers,
  mockCustomers,
  mockProducts,
  mockPlans,
  mockTaxes,
  mockTemplates,
  mockSubscriptions,
  mockInvoices,
  mockPayments,
  mockFinanceReport,
  mockBillingRuns,
  paginate,
} from './data';

const A = '/api/v1';

let currentUser = mockUsers[0]; // default admin

export const handlers = [
  // ── Auth ──
  http.post(`${A}/auth/login`, async ({ request }) => {
    await delay(200);
    const { email, password } = await request.json();
    const found = mockUsers.find((u) => u.email === email);
    if (!found || password !== 'Demo@12345') {
      return HttpResponse.json(
        { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
        { status: 401 }
      );
    }
    currentUser = found;
    return HttpResponse.json({
      accessToken: 'mock-jwt-token',
      user: {
        id: found.id,
        email: found.email,
        name: found.name,
        role: found.role,
        customerId: found.customerId,
      },
    });
  }),

  http.post(`${A}/auth/signup`, async ({ request }) => {
    await delay(300);
    const body = await request.json();
    const exists = mockUsers.some((u) => u.email === body.email);
    if (exists) {
      return HttpResponse.json(
        { error: { code: 'EMAIL_EXISTS', message: 'Email address already registered' } },
        { status: 409 }
      );
    }
    const newCust = {
      id: `cust-${Date.now()}`,
      name: body.companyName || body.fullName,
      email: body.email,
      createdAt: new Date().toISOString(),
    };
    mockCustomers.push(newCust);
    const newUser = {
      id: String(mockUsers.length + 1),
      email: body.email,
      name: body.fullName,
      role: 'CUSTOMER',
      active: true,
      customerId: newCust.id,
      createdAt: new Date().toISOString(),
    };
    mockUsers.push(newUser);
    currentUser = newUser;
    return HttpResponse.json({ message: 'Customer account created successfully' }, { status: 201 });
  }),

  http.post(`${A}/auth/refresh`, async () => {
    await delay(100);
    return HttpResponse.json({
      accessToken: 'mock-jwt-token',
      user: {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
        role: currentUser.role,
        customerId: currentUser.customerId,
      },
    });
  }),

  http.post(`${A}/auth/logout`, async () => {
    await delay(100);
    return HttpResponse.json({ message: 'Logged out successfully' });
  }),

  http.post(`${A}/auth/forgot-password`, async () => {
    await delay(200);
    return HttpResponse.json({ message: 'Recovery link dispatched if account exists' });
  }),

  http.post(`${A}/auth/reset-password`, async () => {
    await delay(200);
    return HttpResponse.json({ message: 'Password updated successfully' });
  }),

  http.get(`${A}/me`, async () => {
    return HttpResponse.json({
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
      role: currentUser.role,
      customerId: currentUser.customerId,
    });
  }),

  http.patch(`${A}/me`, async ({ request }) => {
    const body = await request.json();
    currentUser.name = body.name || currentUser.name;
    return HttpResponse.json(currentUser);
  }),

  // ── Reports ──
  http.get(`${A}/reports/summary`, async () => {
    await delay(120);
    return HttpResponse.json({
      activeSubscriptions: 5124,
      revenueThisMonth: '1042500.00',
      outstanding: '45200.00',
      overdueCount: 2,
      overdueAmount: '28400.00',
      mrr: '1042500.00',
    });
  }),

  http.get(`${A}/reports/revenue`, async () => {
    await delay(120);
    return HttpResponse.json([
      { month: 'Nov 25', amount: '780000.00' },
      { month: 'Dec 25', amount: '810000.00' },
      { month: 'Jan 26', amount: '860000.00' },
      { month: 'Feb 26', amount: '890000.00' },
      { month: 'Mar 26', amount: '920000.00' },
      { month: 'Apr 26', amount: '950000.00' },
      { month: 'May 26', amount: '970000.00' },
      { month: 'Jun 26', amount: '990000.00' },
      { month: 'Jul 26', amount: '1010000.00' },
      { month: 'Aug 26', amount: '1025000.00' },
      { month: 'Sep 26', amount: '1035000.00' },
      { month: 'Oct 26', amount: '1042500.00' },
    ]);
  }),

  http.get(`${A}/reports/subscriptions-by-plan`, async () => {
    await delay(120);
    return HttpResponse.json([
      { planId: '1', planName: 'Enterprise Annual', billingPeriod: 'YEARLY', active: 3240, mrr: '745000.00' },
      { planId: '2', planName: 'Growth Quarterly', billingPeriod: 'MONTHLY', active: 1120, mrr: '198000.00' },
      { planId: '3', planName: 'Starter Monthly', billingPeriod: 'MONTHLY', active: 764, mrr: '99500.00' },
    ]);
  }),

  http.get(`${A}/reports/overdue`, async () => {
    await delay(120);
    return HttpResponse.json({
      data: [
        {
          id: 'inv-2',
          number: 'INV-2026-004992',
          billToName: 'Globex Corporation',
          dueDate: '2026-10-25',
          daysOverdue: 6,
          total: '8307.20',
          amountPaid: '0.00',
          balanceDue: '8307.20',
        },
        {
          id: 'inv-4',
          number: 'INV-2026-004812',
          billToName: 'Initech Systems',
          dueDate: '2026-10-17',
          daysOverdue: 14,
          total: '20092.80',
          amountPaid: '0.00',
          balanceDue: '20092.80',
        },
      ],
      meta: {
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      },
    });
  }),

  http.get(`${A}/reports/finance`, async () => {
    await delay(120);
    return HttpResponse.json(mockFinanceReport);
  }),

  // ── Subscriptions ──
  http.get(`${A}/subscriptions`, async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const page = url.searchParams.get('page') || 1;
    const limit = url.searchParams.get('limit') || 25;
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    let list = [...mockSubscriptions];
    if (status) list = list.filter((s) => s.status === status);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) => s.code.toLowerCase().includes(q) || s.customer?.name?.toLowerCase().includes(q)
      );
    }
    return HttpResponse.json(paginate(list, page, limit));
  }),

  http.post(`${A}/subscriptions`, async ({ request }) => {
    await delay(250);
    const body = await request.json();
    const cust = mockCustomers.find((c) => c.id === body.customerId) || mockCustomers[0];
    const plan = mockPlans.find((p) => p.id === body.planId) || mockPlans[0];
    const newSub = {
      id: `sub-${Date.now()}`,
      code: `SUB-00${mockSubscriptions.length + 4991}`,
      customer: cust,
      customerId: cust.id,
      plan,
      planId: plan.id,
      status: 'DRAFT',
      startDate: body.startDate || '2026-11-01',
      billingAnchor: body.startDate || '2026-11-01',
      nextBillingDate: '2026-12-01',
      totalAmount: '12400.00',
      allowedActions: ['quote', 'close'],
      lines: (body.lines || []).map((l, i) => ({
        id: `line-${Date.now()}-${i}`,
        product: mockProducts.find((p) => p.id === l.productId) || mockProducts[0],
        quantity: l.quantity || 1,
        unitPrice: l.unitPrice || '1200.00',
        total: String(Number(l.unitPrice || 1200) * Number(l.quantity || 1)),
      })),
      history: [
        { id: `h-${Date.now()}`, fromStatus: 'INITIAL', toStatus: 'DRAFT', note: 'Created subscription draft', createdAt: new Date().toISOString(), createdBy: currentUser.name },
      ],
      invoices: [],
    };
    mockSubscriptions.unshift(newSub);
    return HttpResponse.json(newSub, { status: 201 });
  }),

  http.get(`${A}/subscriptions/:id`, async ({ params }) => {
    await delay(150);
    const sub = mockSubscriptions.find((s) => s.id === params.id || s.code === params.id);
    if (!sub) return HttpResponse.json({ error: { message: 'Subscription not found' } }, { status: 404 });
    return HttpResponse.json(sub);
  }),

  http.post(`${A}/subscriptions/:id/transition`, async ({ params, request }) => {
    await delay(200);
    const sub = mockSubscriptions.find((s) => s.id === params.id);
    if (!sub) return HttpResponse.json({ error: { message: 'Subscription not found' } }, { status: 404 });
    const { action } = await request.json();

    const transitions = {
      quote: { to: 'QUOTATION', actions: ['confirm', 'cancel'] },
      confirm: { to: 'CONFIRMED', actions: ['activate', 'close'] },
      activate: { to: 'ACTIVE', actions: ['pause', 'close'] },
      pause: { to: 'PAUSED', actions: ['resume', 'close'] },
      resume: { to: 'ACTIVE', actions: ['pause', 'close'] },
      close: { to: 'CLOSED', actions: [] },
    };

    const target = transitions[action];
    if (target) {
      sub.history.push({
        id: `h-${Date.now()}`,
        fromStatus: sub.status,
        toStatus: target.to,
        note: `Transitioned via ${action}`,
        createdAt: new Date().toISOString(),
        createdBy: currentUser.name,
      });
      sub.status = target.to;
      sub.allowedActions = target.actions;
    }
    return HttpResponse.json(sub);
  }),

  http.post(`${A}/subscriptions/preview`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      subtotal: '16500.00',
      taxTotal: '2970.00',
      discountTotal: '0.00',
      total: '19470.00',
    });
  }),

  // ── Invoices ──
  http.get(`${A}/invoices`, async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const page = url.searchParams.get('page') || 1;
    const limit = url.searchParams.get('limit') || 25;
    const status = url.searchParams.get('status');

    let list = [...mockInvoices];
    if (status && status !== 'ALL') {
      list = list.filter((inv) => inv.status === status);
    }
    return HttpResponse.json(paginate(list, page, limit));
  }),

  http.get(`${A}/invoices/:id`, async ({ params }) => {
    await delay(150);
    const inv = mockInvoices.find((i) => i.id === params.id || i.invoiceNumber === params.id);
    if (!inv) return HttpResponse.json({ error: { message: 'Invoice not found' } }, { status: 404 });
    return HttpResponse.json(inv);
  }),

  http.post(`${A}/invoices/:id/confirm`, async ({ params }) => {
    const inv = mockInvoices.find((i) => i.id === params.id);
    if (inv) inv.status = 'CONFIRMED';
    return HttpResponse.json(inv);
  }),

  http.post(`${A}/invoices/:id/cancel`, async ({ params }) => {
    const inv = mockInvoices.find((i) => i.id === params.id);
    if (inv) inv.status = 'CANCELLED';
    return HttpResponse.json(inv);
  }),

  http.post(`${A}/invoices/:id/send`, async () => {
    return HttpResponse.json({ message: 'Invoice dispatched via email with PDF attachment' });
  }),

  http.post(`${A}/invoices/:id/payments`, async ({ params, request }) => {
    await delay(200);
    const inv = mockInvoices.find((i) => i.id === params.id);
    if (!inv) return HttpResponse.json({ error: { message: 'Invoice not found' } }, { status: 404 });
    const body = await request.json();

    const payment = {
      id: `pay-${Date.now()}`,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      amount: body.amount,
      paymentMethod: body.paymentMethod,
      reference: body.reference,
      note: body.note,
      paidAt: body.paymentDate || new Date().toISOString(),
      recordedBy: { id: currentUser.id, name: currentUser.name },
    };

    inv.payments.push(payment);
    mockPayments.unshift(payment);
    inv.amountPaid = String(Number(inv.amountPaid) + Number(body.amount));
    inv.balanceDue = String(Math.max(0, Number(inv.total) - Number(inv.amountPaid)));
    if (Number(inv.balanceDue) <= 0) {
      inv.status = 'PAID';
    }
    return HttpResponse.json(payment, { status: 201 });
  }),

  // ── Payments ──
  http.get(`${A}/payments`, async ({ request }) => {
    const url = new URL(request.url);
    const page = url.searchParams.get('page') || 1;
    const limit = url.searchParams.get('limit') || 25;
    return HttpResponse.json(paginate(mockPayments, page, limit));
  }),

  // ── Catalog ──
  http.get(`${A}/products`, async () => HttpResponse.json(paginate(mockProducts))),
  http.post(`${A}/products`, async ({ request }) => {
    const body = await request.json();
    const newProd = { id: `prod-${Date.now()}`, ...body, active: true, variants: body.variants || [] };
    mockProducts.push(newProd);
    return HttpResponse.json(newProd, { status: 201 });
  }),
  http.get(`${A}/products/:id`, async ({ params }) => {
    const prod = mockProducts.find((p) => p.id === params.id);
    return HttpResponse.json(prod || mockProducts[0]);
  }),
  http.patch(`${A}/products/:id`, async ({ params, request }) => {
    const prod = mockProducts.find((p) => p.id === params.id);
    const body = await request.json();
    Object.assign(prod, body);
    return HttpResponse.json(prod);
  }),

  http.get(`${A}/plans`, async () => HttpResponse.json(paginate(mockPlans))),
  http.post(`${A}/plans`, async ({ request }) => {
    const body = await request.json();
    const newPlan = { id: `plan-${Date.now()}`, ...body, active: true };
    mockPlans.push(newPlan);
    return HttpResponse.json(newPlan, { status: 201 });
  }),
  http.get(`${A}/plans/:id`, async ({ params }) => {
    const plan = mockPlans.find((p) => p.id === params.id);
    return HttpResponse.json(plan || mockPlans[0]);
  }),
  http.patch(`${A}/plans/:id`, async ({ params, request }) => {
    const plan = mockPlans.find((p) => p.id === params.id);
    const body = await request.json();
    Object.assign(plan, body);
    return HttpResponse.json(plan);
  }),

  http.get(`${A}/taxes`, async () => HttpResponse.json(paginate(mockTaxes))),
  http.post(`${A}/taxes`, async ({ request }) => {
    const body = await request.json();
    const newTax = { id: `tax-${Date.now()}`, ...body, active: true };
    mockTaxes.push(newTax);
    return HttpResponse.json(newTax, { status: 201 });
  }),

  http.get(`${A}/quotation-templates`, async () => HttpResponse.json(paginate(mockTemplates))),
  http.post(`${A}/quotation-templates`, async ({ request }) => {
    const body = await request.json();
    const newTmpl = { id: `tmpl-${Date.now()}`, ...body };
    mockTemplates.push(newTmpl);
    return HttpResponse.json(newTmpl, { status: 201 });
  }),

  // ── Customers ──
  http.get(`${A}/customers`, async () => HttpResponse.json(paginate(mockCustomers))),
  http.post(`${A}/customers`, async ({ request }) => {
    const body = await request.json();
    const newCust = { id: `cust-${Date.now()}`, ...body, createdAt: new Date().toISOString() };
    mockCustomers.push(newCust);
    return HttpResponse.json(newCust, { status: 201 });
  }),
  http.get(`${A}/customers/:id`, async ({ params }) => {
    const cust = mockCustomers.find((c) => c.id === params.id);
    return HttpResponse.json(cust || mockCustomers[0]);
  }),
  http.patch(`${A}/customers/:id`, async ({ params, request }) => {
    const cust = mockCustomers.find((c) => c.id === params.id);
    const body = await request.json();
    Object.assign(cust, body);
    return HttpResponse.json(cust);
  }),

  // ── Users ──
  http.get(`${A}/users`, async () => HttpResponse.json(paginate(mockUsers))),
  http.post(`${A}/users`, async ({ request }) => {
    const body = await request.json();
    const newUser = { id: String(mockUsers.length + 1), ...body, active: true, createdAt: new Date().toISOString() };
    mockUsers.push(newUser);
    return HttpResponse.json(newUser, { status: 201 });
  }),

  // ── Billing Runs ──
  http.get(`${A}/billing/runs`, async () => HttpResponse.json(paginate(mockBillingRuns))),
  http.post(`${A}/billing/run`, async () => {
    await delay(500);
    const newRun = {
      id: `run-${Date.now()}`,
      runDate: '2026-10-31',
      totalSubscriptionsProcessed: 115,
      invoicesCreated: 115,
      errorsCount: 0,
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    };
    mockBillingRuns.unshift(newRun);
    return HttpResponse.json(newRun, { status: 201 });
  }),

  // ── Customer Portal ──
  http.get(`${A}/portal/subscriptions`, async () => {
    const userCustId = currentUser.customerId || 'cust-1';
    const list = mockSubscriptions.filter((s) => s.customerId === userCustId);
    return HttpResponse.json(paginate(list));
  }),

  http.get(`${A}/portal/invoices`, async () => {
    const userCustId = currentUser.customerId || 'cust-1';
    const list = mockInvoices.filter((i) => i.customerId === userCustId);
    return HttpResponse.json(paginate(list));
  }),

  http.get(`${A}/portal/invoices/:id`, async ({ params }) => {
    const inv = mockInvoices.find((i) => i.id === params.id || i.invoiceNumber === params.id);
    return HttpResponse.json(inv || mockInvoices[0]);
  }),
];

