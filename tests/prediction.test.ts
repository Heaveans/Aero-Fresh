import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS } from '../src/lib/risk';
import {
  backtest,
  PREDICTION_HORIZON,
  predictTrends,
  regress,
} from '../src/lib/prediction';
import type { Reading } from '../src/lib/types';

let tick = 0;
const reading = (values: Partial<Reading> = {}): Reading => ({
  t: ++tick * 2500,
  tick,
  unitId: 'SU-01',
  temp: 10,
  rh: 50,
  moisture: null,
  offline: false,
  ...values,
});
const series = (values: Array<Partial<Reading>>) => values.map((value) => reading(value));

test('regression returns slope and fit quality for a straight line', () => {
  const result = regress([1, 3, 5, 7, 9, 11]);
  assert.equal(result.slope, 2);
  assert.equal(result.r2, 1);
});

test('projects threshold crossings from a sufficiently long clean upward trend', () => {
  const history = series(Array.from({ length: 12 }, (_, i) => ({ temp: 7.5 + i * 0.5, rh: 42 + i * 1.5 })));
  const result = predictTrends(history, DEFAULT_THRESHOLDS);
  assert.equal(result.temperature.status, 'projected');
  assert.equal(result.temperature.warningInReadings, 1);
  assert.equal(result.temperature.criticalInReadings, 4);
  assert.equal(result.humidity.status, 'projected');
  assert.equal(result.humidity.warningInReadings, 1);
  assert.equal(result.temperature.confidence, 'high');
  assert.equal(result.temperature.projected.length, PREDICTION_HORIZON);
});

test('withholds projections for insufficient, flat, falling, noisy, offline, or stale data', () => {
  const tooShort = series(Array.from({ length: 5 }, (_, i) => ({ rh: 45 + i })));
  assert.equal(predictTrends(tooShort, DEFAULT_THRESHOLDS).humidity.status, 'insufficient-data');

  const flat = series(Array.from({ length: 12 }, () => ({ rh: 50 })));
  assert.equal(predictTrends(flat, DEFAULT_THRESHOLDS).humidity.status, 'flat');

  const falling = series(Array.from({ length: 12 }, (_, i) => ({ rh: 58 - i })));
  assert.equal(predictTrends(falling, DEFAULT_THRESHOLDS).humidity.status, 'falling');

  const noisy = series([38, 42, 37, 45, 39, 49, 41, 51, 42, 55, 43, 58].map((rh) => ({ rh })));
  assert.equal(predictTrends(noisy, DEFAULT_THRESHOLDS).humidity.status, 'poor-fit');

  const offline = series([{ temp: 10, rh: 50 }, { temp: null, rh: null, offline: true }]);
  assert.equal(predictTrends(offline, DEFAULT_THRESHOLDS).temperature.status, 'offline');

  const rising = series(Array.from({ length: 12 }, (_, i) => ({ rh: 45 + i })));
  assert.equal(predictTrends(rising, DEFAULT_THRESHOLDS, DEFAULT_THRESHOLDS.staleReadings).humidity.status, 'stale');
});

test('never fits across an offline gap', () => {
  const history = series([
    ...Array.from({ length: 8 }, (_, i) => ({ rh: 45 + i })),
    { temp: null, rh: null, offline: true },
    ...Array.from({ length: 3 }, (_, i) => ({ rh: 53 + i })),
  ]);
  const result = predictTrends(history, DEFAULT_THRESHOLDS);
  assert.equal(result.humidity.status, 'insufficient-data');
  assert.equal(result.humidity.sampleCount, 3);
});

test('reports thresholds already reached and respects the search horizon', () => {
  const atLimit = predictTrends(series([{ temp: 15, rh: 65 }]), DEFAULT_THRESHOLDS);
  assert.equal(atLimit.temperature.status, 'at-critical');
  assert.equal(atLimit.humidity.status, 'at-critical');

  const slow = series(Array.from({ length: 12 }, (_, i) => ({ rh: 40 + i * 0.2 })));
  assert.equal(predictTrends(slow, DEFAULT_THRESHOLDS).humidity.status, 'no-crossing');
});

test('forecasts measured grain moisture only', () => {
  const unmeasured = series(Array.from({ length: 12 }, (_, i) => ({ rh: 45 + i })));
  assert.equal(predictTrends(unmeasured, DEFAULT_THRESHOLDS).moisture, null);

  const measured = series(Array.from({ length: 12 }, (_, i) => ({ moisture: 9.6 + i * 0.2 })));
  const moisture = predictTrends(measured, DEFAULT_THRESHOLDS).moisture;
  assert.ok(moisture);
  assert.equal(moisture.status, 'projected');
  assert.equal(moisture.warningInReadings, 1);
});

test('backtest reports error from a past straight-line projection', () => {
  const history = series(Array.from({ length: 12 }, (_, i) => ({ rh: 40 + i * 2 })));
  assert.equal(backtest(history, 'humidity', 5)?.error, 0);
  assert.equal(backtest(history.slice(0, 8), 'humidity', 5), null);
});
