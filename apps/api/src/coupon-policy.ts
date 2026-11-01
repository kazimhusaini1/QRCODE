import { CouponDiscountType } from '@prisma/client';

export function calculateCouponDiscount(input: {
  subtotalPaisa: number;
  type: CouponDiscountType;
  value: number;
  maxDiscountPaisa?: number | null;
}) {
  const { subtotalPaisa, type, value, maxDiscountPaisa } = input;
  if (!Number.isSafeInteger(subtotalPaisa) || subtotalPaisa < 0) throw new RangeError('Subtotal must be a non-negative integer amount in paisa');
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Coupon value must be a positive integer');
  if (maxDiscountPaisa != null && (!Number.isSafeInteger(maxDiscountPaisa) || maxDiscountPaisa < 1)) throw new RangeError('Maximum discount must be a positive integer amount in paisa');
  if (type === CouponDiscountType.PERCENT_BPS && value > 10_000) throw new RangeError('Percentage coupons cannot exceed 100%');
  const unbounded = type === CouponDiscountType.FIXED_PAISE ? value : Math.floor(subtotalPaisa * value / 10_000);
  return Math.min(subtotalPaisa, maxDiscountPaisa == null ? unbounded : Math.min(unbounded, maxDiscountPaisa));
}
