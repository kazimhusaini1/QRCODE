import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CouponDiscountType } from '@prisma/client';
import { calculateCouponDiscount } from './coupon-policy';

test('applies a fixed discount without exceeding the subtotal', () => {
  assert.equal(calculateCouponDiscount({ subtotalPaisa: 20_000, type: CouponDiscountType.FIXED_PAISE, value: 5_000 }), 5_000);
  assert.equal(calculateCouponDiscount({ subtotalPaisa: 3_000, type: CouponDiscountType.FIXED_PAISE, value: 5_000 }), 3_000);
});

test('applies basis-point percentages and maximum discount caps using integer paisa', () => {
  assert.equal(calculateCouponDiscount({ subtotalPaisa: 125_000, type: CouponDiscountType.PERCENT_BPS, value: 1_000 }), 12_500);
  assert.equal(calculateCouponDiscount({ subtotalPaisa: 125_000, type: CouponDiscountType.PERCENT_BPS, value: 1_000, maxDiscountPaisa: 10_000 }), 10_000);
});

test('rejects invalid percentages and values', () => {
  assert.throws(() => calculateCouponDiscount({ subtotalPaisa: 100, type: CouponDiscountType.PERCENT_BPS, value: 10_001 }), RangeError);
  assert.throws(() => calculateCouponDiscount({ subtotalPaisa: -1, type: CouponDiscountType.FIXED_PAISE, value: 10 }), RangeError);
});
