import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS as TH, evaluateRules } from '../src/lib/risk';
import { bandOf, computeScore, scale } from '../src/lib/score';
import type { Reading } from '../src/lib/types';

let k = 0;
const rd = (o: Partial<Reading> = {}): Reading => ({ t: ++k * 2500, tick: k, unitId: 'SU-01', temp: 24, rh: 60, moisture: null, offline: false, ...o });
const make = (n: number, f: (i: number) => Partial<Reading>) => Array.from({ length: n }, (_, i) => rd(f(i)));

test('scale anchors: 0 / 50 / 100 around warn and critical', () => {
  assert.equal(scale(60, 70, 80), 0);
  assert.equal(scale(70, 70, 80), 50);
  assert.equal(scale(80, 70, 80), 100);
  assert.equal(scale(95, 70, 80), 100);
  assert.equal(scale(40, 70, 80), 0);
});

test('baseline conditions score 0 / Low and moisture is excluded, not zero', () => {
  const s = computeScore(make(8, () => ({})), 0, TH);
  assert.equal(s.score, 0);
  assert.equal(s.band, 'Low');
  assert.equal(s.components.find((c) => c.key === 'moisture')!.value, null);
  assert.equal(s.driver, null);
});

test('weights renormalise over measured factors only', () => {
  // humidity 75 -> component 75; temp, trend 0. Without moisture weights sum 0.7: avg = 0.35*75/0.7 = 37.5
  const s = computeScore(make(8, () => ({ rh: 75 })), 0, TH);
  assert.equal(s.score, 60); // floor 0.8*75 = 60 dominates the 37.5 average
  assert.equal(s.driver!.key, 'humidity');
});

test('a single critical factor cannot be diluted below High', () => {
  const s = computeScore(make(8, () => ({ rh: 85 })), 0, TH);
  assert.ok(s.score! >= 80 && s.band === 'High');
});

test('score agrees with alert rules: any finding is at least Elevated, critical is High', () => {
  const cases: Reading[][] = [
    make(6, () => ({ rh: 75 })),
    make(6, () => ({ rh: 85 })),
    make(6, () => ({ temp: 31 })),
    make(6, () => ({ temp: 36 })),
    make(6, (i) => ({ temp: 24 + 0.5 * i })),
    make(6, () => ({ moisture: 14 })),
    make(6, () => ({ moisture: 16 })),
  ];
  for (const h of cases) {
    const findings = evaluateRules(h, 0, TH);
    const s = computeScore(h, 0, TH);
    assert.ok(findings.length > 0);
    assert.notEqual(s.band, 'Low');
    if (findings.some((f) => f.severity === 'critical')) assert.equal(s.band, 'High');
  }
});

test('unknown when there are no readings or the sensor is stale (no fake number)', () => {
  assert.equal(computeScore([], 0, TH).band, 'Unknown');
  const stale = computeScore(make(8, () => ({ rh: 75 })), 3, TH);
  assert.equal(stale.band, 'Unknown');
  assert.equal(stale.score, null);
});

test('band boundaries', () => {
  assert.deepEqual([bandOf(33), bandOf(34), bandOf(66), bandOf(67)], ['Low', 'Elevated', 'Elevated', 'High']);
});

test('measured moisture contributes; high moisture raises the score', () => {
  const s = computeScore(make(8, () => ({ moisture: 15 })), 0, TH);
  assert.equal(s.driver!.key, 'moisture');
  assert.ok(s.score! > 40);
});
