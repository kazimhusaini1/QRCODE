import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const api = process.env.API_URL ?? 'http://127.0.0.1:4000/api/v1';
type Session = { accessToken: string; refreshToken:string; user: { id: string } };

async function call<T>(path: string, options: { method?: string; token?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const value = await response.json().catch(() => null);
  assert.equal(response.ok, true, `${options.method ?? 'GET'} ${path} failed (${response.status}): ${JSON.stringify(value)}`);
  return value as T;
}

async function register(name: string, referralCode?: string): Promise<Session> {
  const email = `${randomUUID()}@example.test`;
  const password = 'E2e-Password!234';
  const created = await call<Session & { verificationRequired?: boolean; testCode?: string }>('/auth/register', { method: 'POST', body: { name, email, password, ...(referralCode ? { referralCode } : {}) } });
  if (!created.verificationRequired) return created;
  assert.match(created.testCode ?? '', /^\d{6}$/, 'test mode should return the verification code');
  await call('/auth/verification/confirm', { method: 'POST', body: { identity: email, code: created.testCode } });
  const reset = await call<{ testCode?: string }>('/auth/password-reset/request', { method: 'POST', body: { identity: email } });
  assert.match(reset.testCode ?? '', /^\d{6}$/, 'test mode should return the reset code');
  await call('/auth/password-reset/confirm', { method: 'POST', body: { identity: email, code: reset.testCode, password } });
  return call('/auth/login', { method: 'POST', body: { identity: email, password } });
}

async function main() {
  const society = await prisma.society.findUniqueOrThrow({ where: { slug: 'park-view-city-lahore' } });
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: 'restaurants' } });
  const extraSociety = await prisma.society.create({ data: { name: `DHA E2E ${randomUUID().slice(0, 8)}`, slug: `dha-e2e-${randomUUID().slice(0, 8)}`, city: 'Lahore', province: 'Punjab' } });
  const inviter = await register('Referral Inviter');
  const invitation = await call<{ referralCode: string }>('/me/referrals', { token: inviter.accessToken });
  const customer = await register('Journey Customer', invitation.referralCode);
  const rotated=await call<Session>('/auth/refresh',{method:'POST',body:{refreshToken:customer.refreshToken}});
  const staleRefresh=await fetch(`${api}/auth/refresh`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refreshToken:customer.refreshToken})});
  assert.equal(staleRefresh.status,401,'a rotated refresh token must not be reusable');
  customer.accessToken=rotated.accessToken;customer.refreshToken=rotated.refreshToken;
  await call('/me/society', { method: 'PATCH', token: customer.accessToken, body: { societyId: society.id } });
  const address = await call<{ id: string }>('/me/addresses', { method: 'POST', token: customer.accessToken, body: { label: 'Home', recipientName: 'Journey Customer', phone: '+923001234567', line1: 'House 10, Park View City', societyId: society.id, isDefault: true } });

  const owner = await register('Journey Merchant');
  const merchant = await call<{ id: string; slug: string }>('/merchant/apply', { method: 'POST', token: owner.accessToken, body: {
    name: `E2E Kitchen ${randomUUID().slice(0, 6)}`, slug: `e2e-kitchen-${randomUUID().slice(0, 8)}`,
    description: 'A test merchant profile with one shared catalog.', phone: '+923001112222', categoryId: category.id,
    societyIds: [society.id], deliveryFeePaisa: 25000, minimumOrderPaisa: 0,
  } });
  const admin = await register('Journey Admin');
  await prisma.user.update({ where: { id: admin.user.id }, data: { role: 'SUPER_ADMIN' } });
  await call(`/admin/merchants/${merchant.id}/status`, { method: 'PATCH', token: admin.accessToken, body: { status: 'APPROVED' } });
  const couponCode = `E2E${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  await call('/admin/coupons', { method: 'POST', token: admin.accessToken, body: { code: couponCode, discountType: 'FIXED_PAISE', value: 20_000, usageLimit: 5, perUserLimit: 1 } });
  const cancelCouponCode = `CAN${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  await call('/admin/coupons', { method: 'POST', token: admin.accessToken, body: { code: cancelCouponCode, discountType: 'PERCENT_BPS', value: 500, usageLimit: 5, perUserLimit: 1 } });
  await call('/merchant/settings', { method: 'PATCH', token: owner.accessToken, body: { isOpen: true, acceptsDelivery: true, acceptsPickup: true } });
  const product = await call<{ id: string }>('/merchant/products', { method: 'POST', token: owner.accessToken, body: { name: 'E2E Family Meal', description: 'Shared catalog product', pricePaisa: 125000, quantity: 5 } });
  await call('/merchant/service-areas', { method: 'PUT', token: owner.accessToken, body: { societyIds: [society.id, extraSociety.id] } });

  const discoverOne = await call<Array<{ id: string }>>(`/merchants?society=${society.slug}`);
  const discoverTwo = await call<Array<{ id: string }>>(`/merchants?society=${extraSociety.slug}`);
  assert(discoverOne.some(item => item.id === merchant.id), 'merchant should be listed in first service area');
  assert(discoverTwo.some(item => item.id === merchant.id), 'same merchant should be listed in additional society');
  const catalog = await call<{ id: string; products: { id: string }[] }>(`/merchants/${merchant.slug}?society=${extraSociety.slug}`);
  assert.equal(catalog.id, merchant.id, 'additional society must use the existing merchant account');
  assert(catalog.products.some(item => item.id === product.id), 'shared product catalog should be visible in both societies');

  const orderKey = randomUUID();
  const quote = await call<{ discountPaisa: number }>('/coupons/quote', { method: 'POST', token: customer.accessToken, body: { code: couponCode, merchantId: merchant.id, societyId: society.id, subtotalPaisa: 250_000 } });
  assert.equal(quote.discountPaisa, 20_000, 'coupon quote must match the checkout discount');
  const order = await call<{ id: string; number: string; subtotalPaisa: number; discountPaisa: number; deliveryFeePaisa: number; totalPaisa: number; status: string }>('/orders', {
    method: 'POST', token: customer.accessToken, idempotencyKey: orderKey,
    body: { merchantId: merchant.id, societyId: society.id, addressId: address.id, fulfillment: 'DELIVERY', paymentMethod: 'CASH_ON_DELIVERY', couponCode, items: [{ productId: product.id, quantity: 2 }] },
  });
  assert.equal(order.subtotalPaisa, 250000);
  assert.equal(order.deliveryFeePaisa, 25000);
  assert.equal(order.discountPaisa, 20_000);
  assert.equal(order.totalPaisa, 255000);
  assert.equal(order.status, 'PENDING');
  const retry = await call<{ id: string }>('/orders', { method: 'POST', token: customer.accessToken, idempotencyKey: orderKey, body: { merchantId: merchant.id, societyId: society.id, addressId: address.id, fulfillment: 'DELIVERY', paymentMethod: 'CASH_ON_DELIVERY', couponCode, items: [{ productId: product.id, quantity: 2 }] } });
  assert.equal(retry.id, order.id, 'checkout retry must return the original order');
  assert.equal((await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity, 3, 'retry must not reserve stock twice');

  for (const status of ['ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'COMPLETED']) await call(`/orders/${order.id}/status`, { method: 'POST', token: owner.accessToken, body: { status } });
  const history = await call<Array<{ id: string; status: string; paymentStatus: string; statusEvents: { status: string }[] }>>('/orders', { token: customer.accessToken });
  const completed = history.find(item => item.id === order.id)!;
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.paymentStatus, 'PAID');
  assert.deepEqual(completed.statusEvents.map(event => event.status), ['PENDING', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'COMPLETED']);
  const referralResults = await call<{ sent: { status: string; rewardCoupon?: { code: string; value: number } | null }[] }>('/me/referrals', { token: inviter.accessToken });
  const referral = referralResults.sent[0];
  assert.equal(referral.status, 'REWARDED', 'inviter should receive a reward after the referred customer completes an order');
  assert.equal(referral.rewardCoupon?.value, 20_000);
  const rewardQuote = await call<{ discountPaisa: number }>('/coupons/quote', { method: 'POST', token: inviter.accessToken, body: { code: referral.rewardCoupon!.code, merchantId: merchant.id, societyId: society.id, subtotalPaisa: 250_000 } });
  assert.equal(rewardQuote.discountPaisa, 20_000, 'referral rewards must be usable as a checkout coupon');
  await call('/me/orders/' + order.id + '/review', { method: 'POST', token: customer.accessToken, body: { rating: 5, comment: 'Great local service.' } });
  const moderation = await call<Array<{ id: string; isPublished: boolean; merchant: { id: string } }>>('/admin/reviews', { token: admin.accessToken });
  const review = moderation.find(item => item.merchant.id === merchant.id && item.isPublished === false);
  assert(review, 'verified purchase reviews must be pending moderation by default');
  await call(`/admin/reviews/${review.id}`, { method: 'PATCH', token: admin.accessToken, body: { isPublished: true } });
  const reviews = await call<{ reviewCount: number; averageRating: number; items: { rating: number }[] }>(`/merchants/${merchant.slug}/reviews`);
  assert.equal(reviews.reviewCount, 1);
  assert.equal(reviews.averageRating, 5);
  assert.equal(reviews.items[0].rating, 5);
  const adminOrders = await call<Array<{ id: string }>>('/admin/orders', { token: admin.accessToken });
  assert(adminOrders.some(item => item.id === order.id), 'admin must be able to inspect the order');

  const cancellation = await call<{ id: string; status: string }>('/orders', { method: 'POST', token: customer.accessToken, idempotencyKey: randomUUID(), body: { merchantId: merchant.id, societyId: society.id, fulfillment: 'PICKUP', paymentMethod: 'CASH_ON_PICKUP', couponCode: cancelCouponCode, items: [{ productId: product.id, quantity: 1 }] } });
  await call(`/orders/${cancellation.id}/status`, { method: 'POST', token: customer.accessToken, body: { status: 'CANCELLED' } });
  assert.equal((await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity, 3, 'cancellation must restore central stock');
  assert.equal((await prisma.coupon.findUniqueOrThrow({ where: { code: cancelCouponCode } })).usageCount, 0, 'cancellation must release coupon usage');
  assert.equal(await prisma.couponRedemption.count({ where: { coupon: { code: cancelCouponCode } } }), 0, 'cancelled orders must not retain coupon redemption records');

  console.log('commerce journey passed: discovery, shared service area, checkout, idempotency, order lifecycle, admin inspection, stock restore');
}

main().finally(() => prisma.$disconnect());
