import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS } from '../src/lib/risk';
import { PREDICTION_HORIZON, predictTrends } from '../src/lib/prediction';
import type { Reading } from '../src/lib/types';

const series = (values: Array<{ temp: number | null; rh: number | null; offline?: boolean }>): Reading[] =>
  values.map((value, i) => ({
    t: i * 2500,
    tick: i + 1,
    unitId: 'SU-01',
    moisture: null,
    offline: value.offline ?? false,
    ...value,
  }));

test('projects warning and critical crossings from recent rising contiguous readings', () => {
  const history = series([
    { temp: 24, rh: 60 },
    { temp: 25, rh: 62 },
    { temp: 26, rh: 64 },
  ]);
  const result = predictTrends(history, DEFAULT_THRESHOLDS);
  assert.equal(result.temperature.status, 'projected');
  assert.equal(result.temperature.warningInReadings, 4);
  assert.equal(result.temperature.criticalInReadings, 9);
  assert.equal(result.humidity.warningInReadings, 3);
});

test('does not project with insufficient data, offline sensor, or non-rising trend', () => {
  assert.equal(predictTrends(series([{ temp: 24, rh: 60 }, { temp: 25, rh: 61 }]), DEFAULT_THRESHOLDS).temperature.status, 'insufficient-data');
  assert.equal(predictTrends(series([{ temp: 24, rh: 60 }, { temp: 25, rh: 61 }, { temp: null, rh: null, offline: true }]), DEFAULT_THRESHOLDS).temperature.status, 'offline');
  assert.equal(predictTrends(series([{ temp: 26, rh: 62 }, { temp: 25, rh: 61 }, { temp: 24, rh: 60 }]), DEFAULT_THRESHOLDS).temperature.status, 'not-rising');
});

test('does not extrapolate across gaps or beyond the forecast horizon', () => {
  const afterGap = series([
    { temp: 24, rh: 60 },
    { temp: 25, rh: 61 },
    { temp: null, rh: null, offline: true },
    { temp: 26, rh: 62 },
    { temp: 27, rh: 63 },
  ]);
  assert.equal(predictTrends(afterGap, DEFAULT_THRESHOLDS).temperature.status, 'insufficient-data');

  const slow = series([
    { temp: 24, rh: 60 },
    { temp: 24.1, rh: 60.1 },
    { temp: 24.2, rh: 60.2 },
  ]);
  const result = predictTrends(slow, DEFAULT_THRESHOLDS);
  assert.equal(result.temperature.status, 'no-crossing');
  assert.equal(result.temperature.warningInReadings, null);
  assert.equal(PREDICTION_HORIZON, 20);
});

test('reports threshold already reached instead of treating it as a future prediction', () => {
  const result = predictTrends(series([
    { temp: 36, rh: 85 },
    { temp: 37, rh: 86 },
    { temp: 38, rh: 87 },
  ]), DEFAULT_THRESHOLDS);
  assert.equal(result.temperature.status, 'at-critical');
  assert.equal(result.humidity.status, 'at-critical');
  assert.equal(result.temperature.warningInReadings, null);
});
