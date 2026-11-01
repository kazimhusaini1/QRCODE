import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRiskIndicators } from './fraud-indicators';

test('flags explainable high-value, repeated cancellation, and high-frequency signals at configured thresholds', () => {
  assert.deepEqual(classifyRiskIndicators(1_000_000, 3, 5, 1_000_000), ['HIGH_VALUE', 'REPEATED_CANCELLATIONS', 'HIGH_ORDER_FREQUENCY']);
});

test('does not flag orders below thresholds', () => {
  assert.deepEqual(classifyRiskIndicators(999_999, 2, 4, 1_000_000), []);
});

test('ignores invalid high-value configuration while preserving other review signals', () => {
  assert.deepEqual(classifyRiskIndicators(9_000_000, 3, 1, Number.NaN), ['REPEATED_CANCELLATIONS']);
});
