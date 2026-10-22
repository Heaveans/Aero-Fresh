import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS } from '../src/lib/risk';
import { computeConditionScore, conditionBand, scaleToThresholds } from '../src/lib/score';
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
const series = (length: number, values: (index: number) => Partial<Reading> = () => ({})) =>
  Array.from({ length }, (_, index) => reading(values(index)));

test('threshold scaling anchors at below warning, warning, and critical', () => {
  assert.equal(scaleToThresholds(50, 60, 65), 0);
  assert.equal(scaleToThresholds(60, 60, 65), 50);
  assert.equal(scaleToThresholds(65, 60, 65), 100);
});

test('baseline score is Low and unmeasured moisture is excluded', () => {
  const result = computeConditionScore(series(8), 0, DEFAULT_THRESHOLDS);
  assert.equal(result.score, 0);
  assert.equal(result.band, 'Low');
  assert.equal(result.factors.find((factor) => factor.key === 'moisture')?.value, null);
  assert.equal(result.mainDriver, null);
});

test('warning and critical threshold readings cannot be diluted by other factors', () => {
  const warning = computeConditionScore(series(8, () => ({ rh: 60 })), 0, DEFAULT_THRESHOLDS);
  assert.ok(warning.score !== null && warning.score >= 34);
  assert.equal(warning.band, 'Elevated');
  assert.equal(warning.mainDriver?.key, 'humidity');

  const critical = computeConditionScore(series(8, () => ({ rh: 65 })), 0, DEFAULT_THRESHOLDS);
  assert.ok(critical.score !== null && critical.score >= 67);
  assert.equal(critical.band, 'High');
});

test('temperature trend and measured grain moisture contribute to the score', () => {
  const trend = computeConditionScore(
    series(6, (index) => ({ temp: 10 + (2 * index) / 5 })),
    0,
    DEFAULT_THRESHOLDS,
  );
  assert.equal(trend.factors.find((factor) => factor.key === 'trend')?.value, 50);
  assert.ok(trend.score !== null && trend.score >= 34);

  const moisture = computeConditionScore(series(8, () => ({ moisture: 12 })), 0, DEFAULT_THRESHOLDS);
  assert.equal(moisture.factors.find((factor) => factor.key === 'moisture')?.value, 50);
  assert.equal(moisture.mainDriver?.key, 'moisture');
});

test('score is Unknown when there are no readings or readings are stale', () => {
  assert.equal(computeConditionScore([], 0, DEFAULT_THRESHOLDS).band, 'Unknown');
  const stale = computeConditionScore(
    series(8, () => ({ rh: 60 })),
    DEFAULT_THRESHOLDS.staleReadings,
    DEFAULT_THRESHOLDS,
  );
  assert.equal(stale.score, null);
  assert.equal(stale.band, 'Unknown');
});

test('score bands have stable boundaries', () => {
  assert.deepEqual([conditionBand(33), conditionBand(34), conditionBand(66), conditionBand(67)], [
    'Low',
    'Elevated',
    'Elevated',
    'High',
  ]);
});
