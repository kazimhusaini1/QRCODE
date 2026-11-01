import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderAmounts, canTransitionOrder } from './order-policy';

test('calculates checkout totals in integer paisa', () => {
  assert.deepEqual(calculateOrderAmounts([{ unitPricePaisa: 12550, quantity: 2 }, { unitPricePaisa: 350, quantity: 1 }], 250), {
    subtotalPaisa: 25450, discountPaisa: 0, deliveryFeePaisa: 250, totalPaisa: 25700,
  });
});

test('rejects invalid quantity and unsafe amounts', () => {
  assert.throws(() => calculateOrderAmounts([{ unitPricePaisa: 10, quantity: 0 }], 0), RangeError);
  assert.throws(() => calculateOrderAmounts([{ unitPricePaisa: Number.MAX_SAFE_INTEGER, quantity: 2 }], 0), RangeError);
});

test('permits only forward order lifecycle transitions', () => {
  assert.equal(canTransitionOrder('PENDING', 'ACCEPTED'), true);
  assert.equal(canTransitionOrder('PREPARING', 'OUT_FOR_DELIVERY'), true);
  assert.equal(canTransitionOrder('COMPLETED', 'CANCELLED'), false);
  assert.equal(canTransitionOrder('PENDING', 'COMPLETED'), false);
});
