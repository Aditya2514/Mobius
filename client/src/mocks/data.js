// client/src/mocks/data.js
export const mockUsers = [
  { id: '1', email: 'admin@brightloop.test', name: 'Brightloop Admin', role: 'ADMIN', active: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '2', email: 'staff@brightloop.test', name: 'Internal Staff Member', role: 'STAFF', active: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '3', email: 'customer@acme.test', name: 'Acme Procurement', role: 'CUSTOMER', active: true, customerId: 'cust-1', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: '4', email: 'customer2@globex.test', name: 'Globex Operations', role: 'CUSTOMER', active: true, customerId: 'cust-2', createdAt: '2026-01-01T00:00:00.000Z' },
];

export const mockCustomers = [
  { id: 'cust-1', name: 'Acme Corporation', email: 'customer@acme.test', phone: '+91 98765 43210', address: 'Plot 42, Electronics City Phase 1', city: 'Bengaluru', state: 'Karnataka', pincode: '560100', gstin: '29ABCDE1234F1Z5', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'cust-2', name: 'Globex Corporation', email: 'customer2@globex.test', phone: '+91 98765 11111', address: 'Tech Boulevard 10', city: 'Kochi', state: 'Kerala', pincode: '682030', gstin: '32ABCDE5678F1Z2', createdAt: '2026-01-05T00:00:00.000Z' },
  { id: 'cust-3', name: 'Initech Systems', email: 'finance@initech.test', phone: '+91 98765 22222', address: 'Cyber Towers 4th Floor', city: 'Hyderabad', state: 'Telangana', pincode: '500081', gstin: '36ABCDE9999F1Z9', createdAt: '2026-01-10T00:00:00.000Z' },
  { id: 'cust-4', name: 'Umbrella Software', email: 'billing@umbrella.test', phone: '+91 98765 33333', address: 'Raccoon Business Park', city: 'Mumbai', state: 'Maharashtra', pincode: '400051', gstin: '27ABCDE4321F1Z8', createdAt: '2026-01-15T00:00:00.000Z' },
];

export const mockProducts = [
  { id: 'prod-1', name: 'Odoo Enterprise Core', description: 'Core ERP system license per user', price: '1200.00', active: true, variants: [
    { id: 'var-1', name: 'Standard Edition', extraPrice: '0.00' },
    { id: 'var-2', name: 'Custom Branding Suite', extraPrice: '560.00' },
  ]},
  { id: 'prod-2', name: 'Dedicated Cloud Database', description: 'High-availability PostgreSQL cluster on AWS', price: '4500.00', active: true, variants: [] },
  { id: 'prod-3', name: '24/7 SLA Priority Support', description: 'Direct phone & emergency escalation line', price: '2500.00', active: true, variants: [] },
  { id: 'prod-4', name: 'Automated Daily S3 Backups', description: 'Encrypted geo-redundant storage with 30-day retention', price: '800.00', active: true, variants: [] },
];

export const mockPlans = [
  { id: 'plan-1', name: 'Starter Monthly', billingPeriod: 'MONTHLY', minQuantity: 1, allowPause: false, allowClose: true, active: true },
  { id: 'plan-2', name: 'Enterprise Annual', billingPeriod: 'ANNUAL', minQuantity: 5, allowPause: true, allowClose: true, active: true },
  { id: 'plan-3', name: 'Growth Quarterly', billingPeriod: 'QUARTERLY', minQuantity: 2, allowPause: true, allowClose: true, active: true },
];

export const mockTaxes = [
  { id: 'tax-1', name: 'GST 18%', rate: '18.00', description: 'Standard GST (CGST 9% + SGST 9%)', active: true },
  { id: 'tax-2', name: 'Zero Rated 0%', rate: '0.00', description: 'SEZ / Export invoices with zero tax', active: true },
];

export const mockTemplates = [
  { id: 'tmpl-1', name: 'Standard Enterprise Package', description: 'Preconfigured Odoo Enterprise + Support + Backups', planId: 'plan-2', lines: [
    { productId: 'prod-1', variantId: 'var-1', quantity: 10, unitPrice: '1200.00' },
    { productId: 'prod-2', variantId: null, quantity: 1, unitPrice: '4500.00' },
    { productId: 'prod-3', variantId: null, quantity: 1, unitPrice: '2500.00' },
  ]},
];

export const mockSubscriptions = [
  {
    id: 'sub-1',
    code: 'SUB-004991',
    customer: mockCustomers[0],
    customerId: 'cust-1',
    plan: mockPlans[1],
    planId: 'plan-2',
    status: 'ACTIVE',
    startDate: '2026-01-01',
    billingAnchor: '2026-10-31',
    nextBillingDate: '2027-10-31',
    totalAmount: '74552.40',
    allowedActions: ['pause', 'close'],
    lines: [
      { id: 'line-1', product: mockProducts[0], variant: mockProducts[0].variants[0], quantity: 10, unitPrice: '1200.00', taxId: 'tax-1', total: '12000.00' },
      { id: 'line-2', product: mockProducts[1], variant: null, quantity: 1, unitPrice: '4500.00', taxId: 'tax-1', total: '4500.00' },
    ],
    invoices: [],
    history: [
      { id: 'h-1', fromStatus: 'DRAFT', toStatus: 'QUOTATION', note: 'Quotation sent to Acme Corp', createdAt: '2026-01-01T10:00:00Z', createdBy: 'Brightloop Admin' },
      { id: 'h-2', fromStatus: 'QUOTATION', toStatus: 'CONFIRMED', note: 'Customer accepted quotation', createdAt: '2026-01-02T11:00:00Z', createdBy: 'Acme Procurement' },
      { id: 'h-3', fromStatus: 'CONFIRMED', toStatus: 'ACTIVE', note: 'First invoice paid and activated', createdAt: '2026-01-02T11:30:00Z', createdBy: 'Brightloop Admin' },
    ],
  },
  {
    id: 'sub-2',
    code: 'SUB-004992',
    customer: mockCustomers[1],
    customerId: 'cust-2',
    plan: mockPlans[0],
    planId: 'plan-1',
    status: 'QUOTATION',
    startDate: '2026-10-25',
    billingAnchor: '2026-10-25',
    nextBillingDate: '2026-11-25',
    totalAmount: '8283.60',
    allowedActions: ['confirm', 'cancel'],
    lines: [
      { id: 'line-3', product: mockProducts[0], variant: mockProducts[0].variants[1], quantity: 4, unitPrice: '1760.00', taxId: 'tax-1', total: '7040.00' },
    ],
    invoices: [],
    history: [
      { id: 'h-4', fromStatus: 'DRAFT', toStatus: 'QUOTATION', note: 'Generated quotation for Globex', createdAt: '2026-10-25T14:00:00Z', createdBy: 'Internal Staff Member' },
    ],
  },
  {
    id: 'sub-3',
    code: 'SUB-004993',
    customer: mockCustomers[2],
    customerId: 'cust-3',
    plan: mockPlans[1],
    planId: 'plan-2',
    status: 'PAUSED',
    startDate: '2026-03-01',
    billingAnchor: '2026-03-01',
    nextBillingDate: '2027-03-01',
    totalAmount: '45000.00',
    allowedActions: ['resume', 'close'],
    lines: [
      { id: 'line-4', product: mockProducts[1], variant: null, quantity: 2, unitPrice: '4500.00', taxId: 'tax-1', total: '9000.00' },
    ],
    invoices: [],
    history: [],
  },
];

export const mockInvoices = [
  {
    id: 'inv-1',
    invoiceNumber: 'INV-2026-004991',
    subscriptionId: 'sub-1',
    subscriptionCode: 'SUB-004991',
    customer: mockCustomers[0],
    customerId: 'cust-1',
    issueDate: '2026-10-31',
    dueDate: '2026-11-15',
    status: 'PAID',
    subtotal: '16500.00',
    taxTotal: '2970.00',
    discountTotal: '0.00',
    total: '19470.00',
    amountPaid: '19470.00',
    balanceDue: '0.00',
    items: [
      { id: 'item-1', description: 'Odoo Enterprise Core (10 users)', quantity: 10, unitPrice: '1200.00', taxRate: '18.00', lineTotal: '14160.00' },
      { id: 'item-2', description: 'Dedicated Cloud Database', quantity: 1, unitPrice: '4500.00', taxRate: '18.00', lineTotal: '5310.00' },
    ],
    payments: [
      { id: 'pay-1', amount: '19470.00', paymentMethod: 'BANK_TRANSFER', reference: 'UTR9817263541', paidAt: '2026-10-31T12:00:00Z', recordedBy: { id: '1', name: 'Brightloop Admin' } },
    ],
  },
  {
    id: 'inv-2',
    invoiceNumber: 'INV-2026-004992',
    subscriptionId: 'sub-2',
    subscriptionCode: 'SUB-004992',
    customer: mockCustomers[1],
    customerId: 'cust-2',
    issueDate: '2026-10-15',
    dueDate: '2026-10-25',
    status: 'OVERDUE',
    subtotal: '7040.00',
    taxTotal: '1267.20',
    discountTotal: '0.00',
    total: '8307.20',
    amountPaid: '0.00',
    balanceDue: '8307.20',
    items: [
      { id: 'item-3', description: 'Odoo Enterprise Core - Custom Branding Suite (4 users)', quantity: 4, unitPrice: '1760.00', taxRate: '18.00', lineTotal: '8307.20' },
    ],
    payments: [],
  },
  {
    id: 'inv-3',
    invoiceNumber: 'INV-2026-004993',
    subscriptionId: 'sub-1',
    subscriptionCode: 'SUB-004991',
    customer: mockCustomers[0],
    customerId: 'cust-1',
    issueDate: '2026-10-31',
    dueDate: '2026-11-15',
    status: 'CONFIRMED',
    subtotal: '2500.00',
    taxTotal: '450.00',
    discountTotal: '0.00',
    total: '2950.00',
    amountPaid: '0.00',
    balanceDue: '2950.00',
    items: [
      { id: 'item-4', description: '24/7 SLA Priority Support', quantity: 1, unitPrice: '2500.00', taxRate: '18.00', lineTotal: '2950.00' },
    ],
    payments: [],
  },
];

export const mockPayments = [
  {
    id: 'pay-1',
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-2026-004991',
    customer: mockCustomers[0],
    amount: '19470.00',
    paymentMethod: 'BANK_TRANSFER',
    reference: 'UTR9817263541',
    note: 'HDFC NEFT Transfer verified',
    paidAt: '2026-10-31T12:00:00Z',
    recordedBy: { id: '1', name: 'Brightloop Admin' },
  },
];

export const mockFinanceReport = {
  mrr: '1042500.00',
  activeSubscriptions: 5124,
  overdueTotal: '28400.00',
  revenue12m: [
    { month: 'Nov 25', revenue: 780000 },
    { month: 'Dec 25', revenue: 810000 },
    { month: 'Jan 26', revenue: 860000 },
    { month: 'Feb 26', revenue: 890000 },
    { month: 'Mar 26', revenue: 920000 },
    { month: 'Apr 26', revenue: 950000 },
    { month: 'May 26', revenue: 970000 },
    { month: 'Jun 26', revenue: 990000 },
    { month: 'Jul 26', revenue: 1010000 },
    { month: 'Aug 26', revenue: 1025000 },
    { month: 'Sep 26', revenue: 1035000 },
    { month: 'Oct 26', revenue: 1042500 },
  ],
  plansBreakdown: [
    { planName: 'Enterprise Annual', count: 3240, mrr: '745000.00' },
    { planName: 'Growth Quarterly', count: 1120, mrr: '198000.00' },
    { planName: 'Starter Monthly', count: 764, mrr: '99500.00' },
  ],
  overdueInvoices: [
    { id: 'inv-2', invoiceNumber: 'INV-2026-004992', customerName: 'Globex Corporation', daysOverdue: 6, total: '8307.20', dueDate: '2026-10-25' },
    { id: 'inv-4', invoiceNumber: 'INV-2026-004812', customerName: 'Initech Systems', daysOverdue: 14, total: '20092.80', dueDate: '2026-10-17' },
  ],
};

export const mockBillingRuns = [
  { id: 'run-1', runDate: '2026-10-31', totalSubscriptionsProcessed: 115, invoicesCreated: 115, errorsCount: 0, status: 'COMPLETED', createdAt: '2026-10-31T00:00:02Z' },
  { id: 'run-2', runDate: '2026-09-30', totalSubscriptionsProcessed: 98, invoicesCreated: 98, errorsCount: 0, status: 'COMPLETED', createdAt: '2026-09-30T00:00:01Z' },
];

export function paginate(items, page = 1, limit = 25) {
  const p = Number(page);
  const l = Number(limit);
  const start = (p - 1) * l;
  const data = items.slice(start, start + l);
  return {
    data,
    meta: {
      total: items.length,
      page: p,
      limit: l,
      totalPages: Math.ceil(items.length / l),
    },
  };
}

