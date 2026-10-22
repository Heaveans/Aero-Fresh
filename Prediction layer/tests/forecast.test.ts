import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS as TH } from '../src/lib/risk';
import { backtest, forecastAll, forecastMetric, outlookText, regress } from '../src/lib/forecast';
import type { Reading } from '../src/lib/types';

let k = 0;
const rd = (o: Partial<Reading> = {}): Reading => ({ t: ++k * 2500, tick: k, unitId: 'SU-01', temp: 24, rh: 60, moisture: null, offline: false, ...o });
const make = (n: number, f: (i: number) => Partial<Reading>) => Array.from({ length: n }, (_, i) => rd(f(i)));

test('regression recovers slope and a perfect fit', () => {
  const r = regress([1, 3, 5, 7, 9, 11]);
  assert.ok(Math.abs(r.slope - 2) < 1e-9 && Math.abs(r.r2 - 1) < 1e-9);
});

test('rising humidity: time-to-threshold maths', () => {
  const h = make(12, (i) => ({ rh: 50 + 1.5 * i })); // latest 66.5, slope 1.5
  const f = forecastMetric(h, 'rh', 0, TH)!;
  assert.equal(f.status, 'ok');
  assert.ok(Math.abs(f.slope - 1.5) < 1e-9);
  assert.equal(f.toWarn, 3); // ceil((70-66.5)/1.5)
  assert.equal(f.toCritical, 9); // ceil((80-66.5)/1.5)
  assert.equal(f.confidence, 'high');
  assert.equal(f.projected.length, 10);
  assert.match(outlookText(f, 2), /Warning limit \(70%\) in ~3 readings \(~4 s at 2×\)/);
});

test('projection is clamped to physical caps', () => {
  const h = make(12, (i) => ({ rh: 80 + 1.5 * i })); // latest 96.5
  const f = forecastMetric(h, 'rh', 0, TH)!;
  assert.ok(f.projected.every((v) => v <= 100));
  assert.equal(f.toWarn, 0);
  assert.equal(f.toCritical, 0);
});

test('declines to project: insufficient, flat, falling, noisy, stale', () => {
  assert.equal(forecastMetric(make(5, (i) => ({ rh: 50 + 2 * i })), 'rh', 0, TH)!.status, 'insufficient');
  assert.equal(forecastMetric(make(12, () => ({ rh: 60 })), 'rh', 0, TH)!.status, 'flat');
  assert.equal(forecastMetric(make(12, (i) => ({ rh: 80 - i })), 'rh', 0, TH)!.status, 'falling');
  const noisy = forecastMetric(make(12, (i) => ({ rh: 60 + 0.3 * i + (i % 2 ? 4 : -4) })), 'rh', 0, TH)!;
  assert.equal(noisy.status, 'poor_fit');
  assert.deepEqual(noisy.projected, []);
  const stale = forecastMetric(make(12, (i) => ({ rh: 50 + i })), 'rh', 3, TH)!;
  assert.equal(stale.status, 'stale');
  assert.match(outlookText(stale), /stale/);
});

test('an offline gap breaks the fit window', () => {
  const h = [...make(8, (i) => ({ rh: 50 + i })), rd({ rh: null, temp: null, offline: true }), ...make(3, (i) => ({ rh: 60 + i }))];
  const f = forecastMetric(h, 'rh', 0, TH)!;
  assert.equal(f.n, 3);
  assert.equal(f.status, 'insufficient');
});

test('grain moisture is only forecast when measured', () => {
  assert.equal(forecastMetric(make(12, (i) => ({ rh: 60 + i })), 'moisture', 0, TH), null);
  assert.equal(forecastAll(make(12, () => ({})), 0, TH).moisture, null);
  const m = forecastMetric(make(12, (i) => ({ moisture: 12 + 0.1 * i })), 'moisture', 0, TH)!; // latest 13.1
  assert.equal(m.status, 'ok');
  assert.equal(m.toWarn, 4); // ceil((13.5-13.1)/0.1)
});

test('forecast never raises alerts: it exposes no alert API', async () => {
  const mod = await import('../src/lib/forecast');
  assert.ok(!Object.keys(mod).some((n) => /alert/i.test(n)));
});

test('backtest: exact on a straight line, and needs enough data', () => {
  const b = backtest(make(12, (i) => ({ rh: 50 + 2 * i })), 'rh', 5)!;
  assert.equal(b.error, 0);
  assert.equal(backtest(make(8, (i) => ({ rh: 50 + i })), 'rh', 5), null);
});

test('backtest exposes error when the trend changes', () => {
  const b = backtest(make(12, (i) => ({ rh: i < 7 ? 50 + 2 * i : 62 })), 'rh', 5)!;
  assert.ok(b.error > 5, 'projected rise that did not happen');
});
