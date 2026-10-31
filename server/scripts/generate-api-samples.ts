import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app';
import { outbox } from '../src/lib/mailer';
import { prisma } from '../src/lib/prisma';
const DEMO_PASSWORD = 'Demo@12345';

const app = createApp();
const api = '/api/v1';
const outDir = resolve(__dirname, '../../docs/api-samples');
mkdirSync(outDir, { recursive: true });

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function rtCookie(res: request.Response): string {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('rt='));
  if (!raw) throw new Error('no rt cookie set');
  return raw.split(';')[0];
}

const samples: { method: string; path: string; role: string; file: string; status: number; note?: string }[] = [];

function saveSample(
  file: string,
  method: string,
  path: string,
  role: string,
  res: request.Response,
  customBody?: unknown,
  note?: string,
) {
  const filePath = resolve(outDir, file);
  let content: unknown;
  if (customBody !== undefined) {
    content = customBody;
  } else if (res.status === 204) {
    content = { status: 204, body: null };
  } else {
    content = res.body;
  }
  writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
  samples.push({ method, path, role, file, status: res.status, note });
  console.log(`Saved ${file} (${method} ${path} -> ${res.status})`);
}

async function main() {
  console.log('Generating API samples against small seed...');

  // 1. POST /auth/signup
  const signupRes = await request(app)
    .post(`${api}/auth/signup`)
    .send({
      email: 'alex.developer@example.test',
      password: 'StrongPassword@123',
      fullName: 'Alex Developer',
      companyName: 'Apex Innovations',
    });
  saveSample('post-auth-signup.json', 'POST', '/auth/signup', 'Public', signupRes);

  // 2. POST /auth/login (Admin)
  const loginAdminRes = await request(app)
    .post(`${api}/auth/login`)
    .send({ email: 'admin@brightloop.test', password: DEMO_PASSWORD });
  const adminToken = loginAdminRes.body.accessToken;
  const adminCookie = rtCookie(loginAdminRes);
  saveSample('post-auth-login.json', 'POST', '/auth/login', 'Public', loginAdminRes);

  // Login as Staff
  const loginStaffRes = await request(app)
    .post(`${api}/auth/login`)
    .send({ email: 'staff@brightloop.test', password: DEMO_PASSWORD });
  const staffToken = loginStaffRes.body.accessToken;

  // Login as Customer (Acme)
  const loginCustomerRes = await request(app)
    .post(`${api}/auth/login`)
    .send({ email: 'customer@acme.test', password: DEMO_PASSWORD });
  const customerToken = loginCustomerRes.body.accessToken;

  // 3. POST /auth/refresh
  const refreshRes = await request(app)
    .post(`${api}/auth/refresh`)
    .set('Cookie', adminCookie);
  saveSample('post-auth-refresh.json', 'POST', '/auth/refresh', 'Cookie', refreshRes);
  const refreshedAdminCookie = rtCookie(refreshRes);

  // 4. POST /auth/logout
  // Create a separate session to log out cleanly
  const logoutLogin = await request(app)
    .post(`${api}/auth/login`)
    .send({ email: 'customer2@globex.test', password: DEMO_PASSWORD });
  const logoutRes = await request(app)
    .post(`${api}/auth/logout`)
    .set('Cookie', rtCookie(logoutLogin));
  saveSample('post-auth-logout.json', 'POST', '/auth/logout', 'Any', logoutRes, undefined, '204 No Content');

  // 5. POST /auth/forgot-password
  outbox.length = 0;
  const forgotRes = await request(app)
    .post(`${api}/auth/forgot-password`)
    .send({ email: 'alex.developer@example.test' });
  saveSample('post-auth-forgot-password.json', 'POST', '/auth/forgot-password', 'Public', forgotRes);

  // 6. POST /auth/reset-password
  const resetEmail = outbox.find((m) => m.to === 'alex.developer@example.test');
  const tokenMatch = resetEmail?.text.match(/token=([^\s]+)/);
  const rawToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : '';
  const resetRes = await request(app)
    .post(`${api}/auth/reset-password`)
    .send({ token: rawToken, newPassword: 'UpdatedPassword@456' });
  saveSample('post-auth-reset-password.json', 'POST', '/auth/reset-password', 'Public', resetRes);

  // 7. GET /me
  const getMeRes = await request(app).get(`${api}/me`).set(bearer(adminToken));
  saveSample('get-me.json', 'GET', '/me', 'Any', getMeRes);

  // 8. PATCH /me
  const patchMeRes = await request(app)
    .patch(`${api}/me`)
    .set(bearer(adminToken))
    .send({ fullName: 'Administrator', phone: '+91 98200 99999' });
  saveSample('patch-me.json', 'PATCH', '/me', 'Any', patchMeRes);

  // 9. GET /users
  const getUsersRes = await request(app).get(`${api}/users?role=STAFF`).set(bearer(adminToken));
  saveSample('get-users.json', 'GET', '/users', 'Admin', getUsersRes);

  // 10. POST /users
  const postUsersRes = await request(app)
    .post(`${api}/users`)
    .set(bearer(adminToken))
    .send({
      email: 'rohan.staff@brightloop.test',
      fullName: 'Rohan Sharma',
      password: 'StaffPassword@123',
    });
  const newStaffId = postUsersRes.body.id;
  saveSample('post-users.json', 'POST', '/users', 'Admin', postUsersRes);

  // 11. PATCH /users/:id
  const patchUsersRes = await request(app)
    .patch(`${api}/users/${newStaffId}`)
    .set(bearer(adminToken))
    .send({ phone: '+91 98111 22222', isActive: true });
  saveSample('patch-users-id.json', 'PATCH', '/users/:id', 'Admin', patchUsersRes);

  // 12. GET /customers
  const getCustomersRes = await request(app).get(`${api}/customers`).set(bearer(staffToken));
  saveSample('get-customers.json', 'GET', '/customers', 'Admin, Staff', getCustomersRes);

  // 13. POST /customers
  const postCustomersRes = await request(app)
    .post(`${api}/customers`)
    .set(bearer(staffToken))
    .send({
      email: 'contact@zephyrlabs.test',
      fullName: 'Zephyr Labs Support',
      companyName: 'Zephyr Technologies Pvt Ltd',
      phone: '+91 97654 32100',
      address: 'Plot 42, Electronics City, Bengaluru 560100',
      gstin: '29AAACZ1234D1Z9',
    });
  const newCustomerId = postCustomersRes.body.id;
  saveSample('post-customers.json', 'POST', '/customers', 'Admin, Staff', postCustomersRes);

  // 14. GET /customers/:id
  const getCustomersIdRes = await request(app).get(`${api}/customers/${newCustomerId}`).set(bearer(staffToken));
  saveSample('get-customers-id.json', 'GET', '/customers/:id', 'Admin, Staff', getCustomersIdRes);

  // 15. PATCH /customers/:id
  const patchCustomersIdRes = await request(app)
    .patch(`${api}/customers/${newCustomerId}`)
    .set(bearer(staffToken))
    .send({ address: 'Level 3, Tech Park, Whitefield, Bengaluru 560066' });
  saveSample('patch-customers-id.json', 'PATCH', '/customers/:id', 'Admin, Staff', patchCustomersIdRes);

  // 16. GET /taxes
  const getTaxesRes = await request(app).get(`${api}/taxes`).set(bearer(staffToken));
  saveSample('get-taxes.json', 'GET', '/taxes', 'Read all', getTaxesRes);

  // 17. POST /taxes
  const postTaxesRes = await request(app)
    .post(`${api}/taxes`)
    .set(bearer(adminToken))
    .send({ name: 'GST 28%', rate: '28.00', isActive: true });
  const newTaxId = postTaxesRes.body.id;
  saveSample('post-taxes.json', 'POST', '/taxes', 'Admin', postTaxesRes);

  // 18. PATCH /taxes/:id
  const patchTaxesRes = await request(app)
    .patch(`${api}/taxes/${newTaxId}`)
    .set(bearer(adminToken))
    .send({ rate: '28.50' });
  saveSample('patch-taxes-id.json', 'PATCH', '/taxes/:id', 'Admin', patchTaxesRes);

  // 19. DELETE /taxes/:id
  const deleteTaxesRes = await request(app).delete(`${api}/taxes/${newTaxId}`).set(bearer(adminToken));
  saveSample('delete-taxes-id.json', 'DELETE', '/taxes/:id', 'Admin', deleteTaxesRes, undefined, '204 No Content (deactivates tax)');

  // 20. GET /products
  const getProductsRes = await request(app).get(`${api}/products`).set(bearer(staffToken));
  saveSample('get-products.json', 'GET', '/products', 'Read all', getProductsRes);

  // 21. POST /products
  const postProductsRes = await request(app)
    .post(`${api}/products`)
    .set(bearer(adminToken))
    .send({
      name: 'Security Suite Pro',
      type: 'SERVICE',
      salesPrice: '1500.00',
      costPrice: '600.00',
      defaultTaxId: '3',
      notes: 'Advanced endpoint protection and security monitoring',
      variants: [{ attribute: 'Edition', value: 'Enterprise', extraPrice: '500.00' }],
    });
  const newProductId = postProductsRes.body.id;
  const initialVariantId = postProductsRes.body.variants?.[0]?.id;
  saveSample('post-products.json', 'POST', '/products', 'Admin', postProductsRes);

  // 22. GET /products/:id
  const getProductsIdRes = await request(app).get(`${api}/products/${newProductId}`).set(bearer(staffToken));
  saveSample('get-products-id.json', 'GET', '/products/:id', 'Read all', getProductsIdRes);

  // 23. PATCH /products/:id
  const patchProductsRes = await request(app)
    .patch(`${api}/products/${newProductId}`)
    .set(bearer(adminToken))
    .send({ salesPrice: '1600.00' });
  saveSample('patch-products-id.json', 'PATCH', '/products/:id', 'Admin', patchProductsRes);

  // 24. DELETE /products/:id
  // Create another product to delete cleanly
  const prodToDelete = await request(app)
    .post(`${api}/products`)
    .set(bearer(adminToken))
    .send({ name: 'Temporary Product', type: 'GOODS', salesPrice: '100.00', costPrice: '50.00' });
  const deleteProductsRes = await request(app)
    .delete(`${api}/products/${prodToDelete.body.id}`)
    .set(bearer(adminToken));
  saveSample('delete-products-id.json', 'DELETE', '/products/:id', 'Admin', deleteProductsRes, undefined, '204 No Content (deactivates product)');

  // 25. POST /products/:id/variants
  const postVariantsRes = await request(app)
    .post(`${api}/products/${newProductId}/variants`)
    .set(bearer(adminToken))
    .send({ attribute: 'Edition', value: 'Ultimate', extraPrice: '900.00' });
  const newVariantId = postVariantsRes.body.id;
  saveSample('post-products-id-variants.json', 'POST', '/products/:id/variants', 'Admin', postVariantsRes);

  // 26. PATCH /variants/:id
  const patchVariantsRes = await request(app)
    .patch(`${api}/variants/${newVariantId}`)
    .set(bearer(adminToken))
    .send({ extraPrice: '950.00' });
  saveSample('patch-variants-id.json', 'PATCH', '/variants/:id', 'Admin', patchVariantsRes);

  // 27. DELETE /variants/:id
  const deleteVariantsRes = await request(app)
    .delete(`${api}/variants/${newVariantId}`)
    .set(bearer(adminToken));
  saveSample('delete-variants-id.json', 'DELETE', '/variants/:id', 'Admin', deleteVariantsRes, undefined, '204 No Content');

  // 28. GET /plans
  const getPlansRes = await request(app).get(`${api}/plans`).set(bearer(staffToken));
  saveSample('get-plans.json', 'GET', '/plans', 'Read all', getPlansRes);

  // 29. POST /plans
  const postPlansRes = await request(app)
    .post(`${api}/plans`)
    .set(bearer(adminToken))
    .send({
      name: 'Custom Annual Pass',
      price: '15000.00',
      billingPeriod: 'YEARLY',
      minQuantity: 2,
      availableFrom: '2026-01-01',
      autoClose: false,
      isClosable: true,
      isPausable: true,
      isRenewable: true,
    });
  const newPlanId = postPlansRes.body.id;
  saveSample('post-plans.json', 'POST', '/plans', 'Admin', postPlansRes);

  // 30. GET /plans/:id
  const getPlansIdRes = await request(app).get(`${api}/plans/${newPlanId}`).set(bearer(staffToken));
  saveSample('get-plans-id.json', 'GET', '/plans/:id', 'Read all', getPlansIdRes);

  // 31. PATCH /plans/:id
  const patchPlansRes = await request(app)
    .patch(`${api}/plans/${newPlanId}`)
    .set(bearer(adminToken))
    .send({ price: '16000.00' });
  saveSample('patch-plans-id.json', 'PATCH', '/plans/:id', 'Admin', patchPlansRes);

  // 32. GET /quotation-templates
  const getTemplatesRes = await request(app).get(`${api}/quotation-templates`).set(bearer(staffToken));
  saveSample('get-quotation-templates.json', 'GET', '/quotation-templates', 'Admin, Staff', getTemplatesRes);

  // 33. POST /quotation-templates
  const postTemplatesRes = await request(app)
    .post(`${api}/quotation-templates`)
    .set(bearer(adminToken))
    .send({
      name: 'Security Starter Pack',
      planId: '3',
      validityDays: 30,
      paymentTermsDays: 15,
      notes: 'Includes CRM Pro and Security Suite',
      lines: [
        { productId: '1', variantId: '1', quantity: 5, taxId: '3' },
        { productId: newProductId, quantity: 2, taxId: '3' },
      ],
    });
  const newTemplateId = postTemplatesRes.body.id;
  saveSample('post-quotation-templates.json', 'POST', '/quotation-templates', 'Admin', postTemplatesRes);

  // 34. GET /quotation-templates/:id
  const getTemplatesIdRes = await request(app).get(`${api}/quotation-templates/${newTemplateId}`).set(bearer(staffToken));
  saveSample('get-quotation-templates-id.json', 'GET', '/quotation-templates/:id', 'Admin, Staff', getTemplatesIdRes);

  // 35. PATCH /quotation-templates/:id
  const patchTemplatesRes = await request(app)
    .patch(`${api}/quotation-templates/${newTemplateId}`)
    .set(bearer(adminToken))
    .send({ validityDays: 45, notes: 'Updated validity to 45 days' });
  saveSample('patch-quotation-templates-id.json', 'PATCH', '/quotation-templates/:id', 'Admin', patchTemplatesRes);

  // 36. DELETE /quotation-templates/:id
  const deleteTemplatesRes = await request(app)
    .delete(`${api}/quotation-templates/${newTemplateId}`)
    .set(bearer(adminToken));
  saveSample('delete-quotation-templates-id.json', 'DELETE', '/quotation-templates/:id', 'Admin', deleteTemplatesRes, undefined, '204 No Content');

  // 37. GET /subscriptions
  const getSubsRes = await request(app).get(`${api}/subscriptions`).set(bearer(staffToken));
  saveSample('get-subscriptions.json', 'GET', '/subscriptions', 'Admin, Staff, Customer', getSubsRes);

  // 38. POST /subscriptions
  const postSubsRes = await request(app)
    .post(`${api}/subscriptions`)
    .set(bearer(staffToken))
    .send({
      customerId: '3', // Acme Ops
      planId: '3', // CRM Monthly (min quantity 1)
      startDate: '2026-11-01',
      paymentTermsDays: 15,
      notes: 'Initial quotation draft for expansion seats',
    });
  const createdSubId = postSubsRes.body.id;
  saveSample('post-subscriptions.json', 'POST', '/subscriptions', 'Admin, Staff', postSubsRes);

  // 39. GET /subscriptions/:id
  const getSubIdRes = await request(app).get(`${api}/subscriptions/${createdSubId}`).set(bearer(staffToken));
  saveSample('get-subscriptions-id.json', 'GET', '/subscriptions/:id', 'Scoped', getSubIdRes);

  // 40. PATCH /subscriptions/:id
  const patchSubRes = await request(app)
    .patch(`${api}/subscriptions/${createdSubId}`)
    .set(bearer(staffToken))
    .send({ notes: 'Quotation for 5 Odoo CRM seats with premium setup' });
  saveSample('patch-subscriptions-id.json', 'PATCH', '/subscriptions/:id', 'Admin, Staff', patchSubRes);

  // 41. POST /subscriptions/:id/lines
  const postSubLineRes = await request(app)
    .post(`${api}/subscriptions/${createdSubId}/lines`)
    .set(bearer(staffToken))
    .send({
      productId: '1',
      variantId: '1',
      quantity: 5,
      taxId: '3',
    });
  const firstLineId = postSubLineRes.body.lines[0].id;
  saveSample('post-subscriptions-id-lines.json', 'POST', '/subscriptions/:id/lines', 'Admin, Staff', postSubLineRes);

  // Add a second line to test patch and delete
  const addSecondLineRes = await request(app)
    .post(`${api}/subscriptions/${createdSubId}/lines`)
    .set(bearer(staffToken))
    .send({ productId: '4', quantity: 2, taxId: '3' }); // Cloud Storage 100GB
  const secondLineId = addSecondLineRes.body.lines.find((l: any) => l.product.id === '4').id;

  // 42. PATCH /subscriptions/:id/lines/:lineId
  const patchSubLineRes = await request(app)
    .patch(`${api}/subscriptions/${createdSubId}/lines/${secondLineId}`)
    .set(bearer(staffToken))
    .send({ quantity: 3 });
  saveSample('patch-subscriptions-id-lines-id.json', 'PATCH', '/subscriptions/:id/lines/:lineId', 'Admin, Staff', patchSubLineRes);

  // 43. DELETE /subscriptions/:id/lines/:lineId
  const deleteSubLineRes = await request(app)
    .delete(`${api}/subscriptions/${createdSubId}/lines/${secondLineId}`)
    .set(bearer(staffToken));
  saveSample('delete-subscriptions-id-lines-id.json', 'DELETE', '/subscriptions/:id/lines/:lineId', 'Admin, Staff', deleteSubLineRes);

  // 44. POST /subscriptions/:id/transition (send_quote)
  const transitionRes = await request(app)
    .post(`${api}/subscriptions/${createdSubId}/transition`)
    .set(bearer(staffToken))
    .send({ action: 'send_quote' });
  saveSample('post-subscriptions-id-transition.json', 'POST', '/subscriptions/:id/transition', 'Scoped', transitionRes);

  // 45. GET /subscriptions/:id/history
  const getSubHistoryRes = await request(app)
    .get(`${api}/subscriptions/${createdSubId}/history`)
    .set(bearer(staffToken));
  saveSample('get-subscriptions-id-history.json', 'GET', '/subscriptions/:id/history', 'Admin, Staff', getSubHistoryRes);

  // 46. POST /subscriptions/:id/invoice (Bill subscription 1: Acme demo sub, ACTIVE, started 30 days ago)
  const postSubInvoiceRes = await request(app)
    .post(`${api}/subscriptions/1/invoice`)
    .set(bearer(staffToken));
  saveSample('post-subscriptions-id-invoice.json', 'POST', '/subscriptions/:id/invoice', 'Admin, Staff', postSubInvoiceRes);

  // Also bill subscription 2 (Globex) and subscription 3 to generate invoices for confirm/bulk-confirm/cancel
  await request(app).post(`${api}/subscriptions/2/invoice`).set(bearer(staffToken));
  await request(app).post(`${api}/subscriptions/3/invoice`).set(bearer(staffToken));

  // 47. GET /discounts
  const getDiscountsRes = await request(app).get(`${api}/discounts`).set(bearer(staffToken));
  saveSample('get-discounts.json', 'GET', '/discounts', 'Admin, Staff', getDiscountsRes);

  // 48. POST /discounts
  const postDiscountsRes = await request(app)
    .post(`${api}/discounts`)
    .set(bearer(adminToken))
    .send({
      name: 'Festive 15%',
      type: 'PERCENTAGE',
      value: '15.00',
      scope: 'SUBSCRIPTION',
      minPurchase: '500.00',
      minQuantity: 1,
      startDate: '2026-10-01',
      usageLimit: 50,
      isActive: true,
    });
  const newDiscountId = postDiscountsRes.body.id;
  saveSample('post-discounts.json', 'POST', '/discounts', 'Admin', postDiscountsRes);

  // 49. GET /discounts/:id
  const getDiscountsIdRes = await request(app).get(`${api}/discounts/${newDiscountId}`).set(bearer(staffToken));
  saveSample('get-discounts-id.json', 'GET', '/discounts/:id', 'Admin, Staff', getDiscountsIdRes);

  // 50. PATCH /discounts/:id
  const patchDiscountsRes = await request(app)
    .patch(`${api}/discounts/${newDiscountId}`)
    .set(bearer(adminToken))
    .send({ usageLimit: 75 });
  saveSample('patch-discounts-id.json', 'PATCH', '/discounts/:id', 'Admin', patchDiscountsRes);

  // 51. GET /invoices
  const getInvoicesRes = await request(app).get(`${api}/invoices`).set(bearer(staffToken));
  saveSample('get-invoices.json', 'GET', '/invoices', 'Admin, Staff, Customer', getInvoicesRes);

  // 52. GET /invoices/:id (Invoice 1, created by billing sub 1)
  const getInvoiceIdRes = await request(app).get(`${api}/invoices/1`).set(bearer(staffToken));
  saveSample('get-invoices-id.json', 'GET', '/invoices/:id', 'Scoped', getInvoiceIdRes);

  // 53. POST /invoices/:id/confirm (Confirm invoice 1)
  const confirmInvoiceRes = await request(app)
    .post(`${api}/invoices/1/confirm`)
    .set(bearer(staffToken));
  saveSample('post-invoices-id-confirm.json', 'POST', '/invoices/:id/confirm', 'Admin, Staff', confirmInvoiceRes);

  // 54. POST /invoices/bulk-confirm (Confirm invoice 2)
  const bulkConfirmRes = await request(app)
    .post(`${api}/invoices/bulk-confirm`)
    .set(bearer(staffToken))
    .send({ ids: ['2'] });
  saveSample('post-invoices-bulk-confirm.json', 'POST', '/invoices/bulk-confirm', 'Admin, Staff', bulkConfirmRes);

  // 55. POST /invoices/:id/cancel (Cancel invoice 3, which is still in DRAFT)
  const cancelInvoiceRes = await request(app)
    .post(`${api}/invoices/3/cancel`)
    .set(bearer(staffToken));
  saveSample('post-invoices-id-cancel.json', 'POST', '/invoices/:id/cancel', 'Admin, Staff', cancelInvoiceRes);

  // 56. POST /invoices/:id/send (Send confirmed invoice 1)
  outbox.length = 0;
  const sendInvoiceRes = await request(app)
    .post(`${api}/invoices/1/send`)
    .set(bearer(staffToken));
  saveSample('post-invoices-id-send.json', 'POST', '/invoices/:id/send', 'Admin, Staff', sendInvoiceRes);

  // 57. GET /invoices/:id/pdf (Scoped)
  const pdfRes = await request(app).get(`${api}/invoices/1/pdf`).set(bearer(staffToken));
  const pdfSample = {
    status: pdfRes.status,
    contentType: pdfRes.headers['content-type'],
    contentDisposition: pdfRes.headers['content-disposition'],
    byteLength: pdfRes.body ? Buffer.byteLength(pdfRes.body) : 0,
    note: 'Binary PDF stream (application/pdf)',
  };
  saveSample('get-invoices-id-pdf.json', 'GET', '/invoices/:id/pdf', 'Scoped', pdfRes, pdfSample, 'application/pdf');

  // 58. GET /invoices/:id/print (Scoped)
  const printRes = await request(app).get(`${api}/invoices/1/print`).set(bearer(staffToken));
  const printSample = {
    status: printRes.status,
    contentType: printRes.headers['content-type'],
    htmlPreview: printRes.text.slice(0, 500) + '... [truncated for sample]',
  };
  saveSample('get-invoices-id-print.json', 'GET', '/invoices/:id/print', 'Scoped', printRes, printSample, 'text/html invoice print view');

  // 59. POST /invoices/:id/payments (Record ₹5000 partial payment on invoice 1)
  const postPaymentRes = await request(app)
    .post(`${api}/invoices/1/payments`)
    .set(bearer(staffToken))
    .send({
      method: 'UPI',
      amount: '5000.00',
      paidOn: '2026-10-31',
      reference: 'UPI/987654321/AXIS',
      note: 'Part payment via UPI',
    });
  saveSample('post-invoices-id-payments.json', 'POST', '/invoices/:id/payments', 'Admin, Staff', postPaymentRes);

  // 60. GET /payments
  const getPaymentsRes = await request(app).get(`${api}/payments`).set(bearer(staffToken));
  saveSample('get-payments.json', 'GET', '/payments', 'Admin, Staff, Customer', getPaymentsRes);

  // 61. POST /billing/run
  const postBillingRunRes = await request(app)
    .post(`${api}/billing/run`)
    .set(bearer(adminToken))
    .send({});
  saveSample('post-billing-run.json', 'POST', '/billing/run', 'Admin', postBillingRunRes);

  // 62. GET /billing/runs
  const getBillingRunsRes = await request(app).get(`${api}/billing/runs`).set(bearer(adminToken));
  saveSample('get-billing-runs.json', 'GET', '/billing/runs', 'Admin', getBillingRunsRes);

  // 63. GET /reports/summary
  const getSummaryRes = await request(app).get(`${api}/reports/summary`).set(bearer(staffToken));
  saveSample('get-reports-summary.json', 'GET', '/reports/summary', 'Admin, Staff', getSummaryRes);

  // 64. GET /reports/revenue
  const getRevenueRes = await request(app).get(`${api}/reports/revenue`).set(bearer(staffToken));
  saveSample('get-reports-revenue.json', 'GET', '/reports/revenue', 'Admin, Staff', getRevenueRes);

  // 65. GET /reports/overdue
  const getOverdueRes = await request(app).get(`${api}/reports/overdue`).set(bearer(staffToken));
  saveSample('get-reports-overdue.json', 'GET', '/reports/overdue', 'Admin, Staff', getOverdueRes);

  // 66. GET /reports/subscriptions-by-plan
  const getSubsByPlanRes = await request(app).get(`${api}/reports/subscriptions-by-plan`).set(bearer(staffToken));
  saveSample('get-reports-subscriptions-by-plan.json', 'GET', '/reports/subscriptions-by-plan', 'Admin, Staff', getSubsByPlanRes);

  // ---------- ERROR CASES ----------

  // 67. 400 Validation Error (with details.field and details.fields)
  const errValidationRes = await request(app)
    .post(`${api}/auth/signup`)
    .send({
      email: 'not-an-email',
      password: 'weak',
      fullName: '',
    });
  saveSample('error-400-validation.json', 'POST', '/auth/signup', 'Public', errValidationRes, undefined, '400 VALIDATION_ERROR with field and fields');

  // 68. 400 Business Rule Error (details.field only)
  const errBusinessRuleRes = await request(app)
    .post(`${api}/invoices/1/payments`)
    .set(bearer(staffToken))
    .send({
      method: 'CASH',
      amount: '9999999.00',
      paidOn: '2026-10-31',
    });
  saveSample('error-400-business-rule.json', 'POST', '/invoices/:id/payments', 'Admin, Staff', errBusinessRuleRes, undefined, '400 BUSINESS_RULE');

  // 69. 400 Invalid Transition Error (details.allowed)
  const errInvalidTransitionRes = await request(app)
    .post(`${api}/subscriptions/1/transition`)
    .set(bearer(staffToken))
    .send({ action: 'send_quote' }); // sub 1 is ACTIVE, cannot send_quote
  saveSample('error-400-invalid-transition.json', 'POST', '/subscriptions/:id/transition', 'Scoped', errInvalidTransitionRes, undefined, '400 INVALID_TRANSITION with details.allowed');

  // 70. 401 Unauthenticated
  const errUnauthRes = await request(app).get(`${api}/me`);
  saveSample('error-401-unauthenticated.json', 'GET', '/me', 'Any', errUnauthRes, undefined, '401 UNAUTHENTICATED');

  // 71. 401 Refresh with details.retry = true (reuse within 30 s grace)
  const errRefreshRetryRes = await request(app)
    .post(`${api}/auth/refresh`)
    .set('Cookie', adminCookie); // adminCookie was already rotated above
  saveSample('error-401-refresh-retry.json', 'POST', '/auth/refresh', 'Cookie', errRefreshRetryRes, undefined, '401 UNAUTHENTICATED with details.retry');

  // 72. 403 Forbidden
  const errForbiddenRes = await request(app)
    .post(`${api}/discounts`)
    .set(bearer(staffToken))
    .send({
      name: 'Staff Unauthorized Discount',
      type: 'PERCENTAGE',
      value: '10.00',
      scope: 'PRODUCT',
      minQuantity: 1,
      startDate: '2026-10-01',
      productIds: ['1'],
    });
  saveSample('error-403-forbidden.json', 'POST', '/discounts', 'Staff', errForbiddenRes, undefined, '403 FORBIDDEN');

  // 73. 404 Not Found (or another customer\'s resource)
  const errNotFoundRes = await request(app)
    .get(`${api}/customers/9999999`)
    .set(bearer(staffToken));
  saveSample('error-404-not-found.json', 'GET', '/customers/:id', 'Admin, Staff', errNotFoundRes, undefined, '404 NOT_FOUND');

  // 74. 409 Conflict / Email Taken
  const errConflictRes = await request(app)
    .post(`${api}/auth/signup`)
    .send({
      email: 'admin@brightloop.test',
      password: 'StrongPassword@123',
      fullName: 'Duplicate Admin',
    });
  saveSample('error-409-conflict.json', 'POST', '/auth/signup', 'Public', errConflictRes, undefined, '409 EMAIL_TAKEN');

  // 75. 429 Rate Limited (trigger by exceeding AUTH_RATE_LIMIT = 30)
  console.log('Sending requests to trigger 429 rate limit...');
  let rateLimitedRes: request.Response | null = null;
  for (let i = 0; i < 35; i++) {
    const r = await request(app)
      .post(`${api}/auth/forgot-password`)
      .send({ email: 'rate.limit@test.com' });
    if (r.status === 429) {
      rateLimitedRes = r;
      break;
    }
  }
  if (!rateLimitedRes) {
    throw new Error('Could not trigger 429 RATE_LIMITED');
  }
  saveSample('error-429-rate-limited.json', 'POST', '/auth/forgot-password', 'Public', rateLimitedRes, undefined, '429 RATE_LIMITED');

  // Generate README.md
  const readmeLines = [
    '# Mobius API Response Samples',
    '',
    'Real API responses generated against the small seed database (`npm run db:seed`).',
    'These samples document the live JSON shapes for all endpoints in `docs/API_CONTRACT.md` and standard error responses.',
    '',
    '## Endpoints',
    '',
    '| Method | Path | Allowed Roles | Status | Sample File | Notes |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
  ];

  for (const s of samples) {
    readmeLines.push(
      `| \`${s.method}\` | \`${s.path}\` | ${s.role} | \`${s.status}\` | [\`${s.file}\`](./${s.file}) | ${s.note ?? ''} |`,
    );
  }

  readmeLines.push('');
  writeFileSync(resolve(outDir, 'README.md'), readmeLines.join('\n') + '\n', 'utf8');
  console.log(`Generated README.md with ${samples.length} sample entries.`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error('Error generating samples:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
