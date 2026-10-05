import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, queueSettlesWithoutGrowth } from './perf-metrics.mjs';

test('nearest-rank p95 uses repeated measured samples', () => {
  const samples = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.equal(percentile(samples, 95), 19);
});

test('queue evidence may rise to one peak but must then drain monotonically to empty', () => {
  assert.equal(queueSettlesWithoutGrowth([0, 80, 62, 31, 4, 0]), true);
  assert.equal(queueSettlesWithoutGrowth([80, 62, 64, 0]), false);
  assert.equal(queueSettlesWithoutGrowth([10, 3, 1]), false);
});
