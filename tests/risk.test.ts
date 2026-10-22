import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS as TH, evaluateRules, overallStatus, reconcileAlerts } from '../src/lib/risk';
import type { Alert, Reading } from '../src/lib/types';

let tick = 0;
const rd = (o: Partial<Reading> = {}): Reading => ({ t: 1000 + ++tick * 2500, tick, unitId: 'SU-01', temp: 24, rh: 60, moisture: null, offline: false, ...o });
const series = (n: number, o: Partial<Reading> | ((i: number) => Partial<Reading>)) => Array.from({ length: n }, (_, i) => rd(typeof o === 'function' ? o(i) : o));
const ctx = (t: number, cooldownTicks = TH.cooldownTicks) => ({ tick: t, now: t * 1000, unitId: 'SU-01', unitName: 'Unit', cooldownTicks });

test('normal readings produce no findings', () => {
  assert.deepEqual(evaluateRules(series(10, {}), 0, TH), []);
});

test('humidity: findings are detected immediately and alert delay is applied by the state reducer', () => {
  const warn = evaluateRules(series(1, { rh: 75 }), 0, TH);
  assert.equal(warn[0].ruleId, 'humidity');
  assert.equal(warn[0].severity, 'warning');
  const crit = evaluateRules(series(1, { rh: 85 }), 0, TH);
  assert.equal(crit[0].severity, 'critical');
});

test('grain moisture is never inferred from ambient humidity', () => {
  const f = evaluateRules(series(10, { rh: 95, moisture: null }), 0, TH);
  assert.ok(f.every((x) => x.ruleId !== 'moisture'));
  assert.match(f[0].reason, /not grain moisture/i);
});

test('grain moisture rule only fires on a supplied measurement', () => {
  assert.equal(evaluateRules(series(2, { moisture: 13 }), 0, TH).length, 0);
  assert.equal(evaluateRules(series(2, { moisture: 14 }), 0, TH)[0].severity, 'warning');
  assert.equal(evaluateRules(series(2, { moisture: 16 }), 0, TH)[0].severity, 'critical');
});

test('temperature: absolute limits and unusual rise', () => {
  assert.equal(evaluateRules(series(2, { temp: 31 }), 0, TH)[0].severity, 'warning');
  assert.equal(evaluateRules(series(2, { temp: 36 }), 0, TH)[0].severity, 'critical');
  // 24 -> 26.5 over 6 readings, still below 30 °C: trend only
  const trend = evaluateRules(series(6, (i) => ({ temp: 24 + i * 0.5 })), 0, TH);
  assert.equal(trend[0].ruleId, 'temperature');
  assert.match(trend[0].reason, /rose/);
  // slow drift is not flagged
  assert.equal(evaluateRules(series(6, (i) => ({ temp: 24 + i * 0.1 })), 0, TH).length, 0);
});

test('offline: stale readings raise an alert and escalate', () => {
  const gap = series(5, { temp: null, rh: null, offline: true });
  assert.equal(evaluateRules(gap, 2, TH).length, 0);
  assert.equal(evaluateRules(gap, 3, TH)[0].severity, 'warning');
  assert.equal(evaluateRules(gap, 9, TH)[0].severity, 'critical');
});

test('findings carry severity, trigger, reason and recommended actions (no safety claims)', () => {
  const f = evaluateRules(series(1, { rh: 75 }), 0, TH)[0];
  assert.ok(f.trigger && f.reason && f.actions.length >= 3);
  assert.ok(f.actions.some((a) => /moisture meter/i.test(a)));
  assert.ok(!/aflatoxin-free|pest-free|\bsafe\b/i.test(f.reason + f.actions.join(' ')));
});

test('dedup: a persisting condition yields exactly one alert across many ticks', () => {
  const finding = evaluateRules(series(1, { rh: 75 }), 0, TH);
  let alerts: Alert[] = [];
  let events = 0;
  for (let t = 1; t <= 50; t++) {
    const r = reconcileAlerts(alerts, finding, ctx(t));
    alerts = r.alerts;
    events += r.events.length;
  }
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].occurrences, 50);
  assert.equal(events, 1, 'only the first tick logs an event');
});

test('dedup: acknowledgement survives while the condition persists; escalation re-activates', () => {
  const warn = evaluateRules(series(1, { rh: 75 }), 0, TH);
  const crit = evaluateRules(series(1, { rh: 85 }), 0, TH);
  let { alerts } = reconcileAlerts([], warn, ctx(1));
  alerts = alerts.map((a) => ({ ...a, status: 'acknowledged' as const }));
  alerts = reconcileAlerts(alerts, warn, ctx(2)).alerts;
  assert.equal(alerts[0].status, 'acknowledged');
  const esc = reconcileAlerts(alerts, crit, ctx(3));
  assert.equal(esc.alerts.length, 1);
  assert.equal(esc.alerts[0].severity, 'critical');
  assert.equal(esc.alerts[0].status, 'active');
});

test('auto-resolve when the condition clears; cooldown blocks immediate re-alert', () => {
  const finding = evaluateRules(series(1, { rh: 75 }), 0, TH);
  let { alerts } = reconcileAlerts([], finding, ctx(1));
  alerts = reconcileAlerts(alerts, [], ctx(2)).alerts;
  assert.equal(alerts[0].status, 'resolved');
  assert.equal(alerts[0].resolvedBy, 'auto');
  alerts = reconcileAlerts(alerts, finding, ctx(5)).alerts; // inside cooldown (20)
  assert.equal(alerts.length, 1);
  alerts = reconcileAlerts(alerts, finding, ctx(30)).alerts; // after cooldown
  assert.equal(alerts.length, 2);
  assert.equal(alerts[1].status, 'active');
});

test('user-resolved alert is not re-raised during cooldown even if the condition persists', () => {
  const finding = evaluateRules(series(1, { rh: 75 }), 0, TH);
  let { alerts } = reconcileAlerts([], finding, ctx(1));
  alerts = alerts.map((a) => ({ ...a, status: 'resolved' as const, resolvedTick: 3, resolvedBy: 'user' as const }));
  assert.equal(reconcileAlerts(alerts, finding, ctx(10)).alerts.length, 1);
  assert.equal(reconcileAlerts(alerts, finding, ctx(24)).alerts.length, 2);
});

test('overall status follows unresolved alerts', () => {
  const f = evaluateRules(series(1, { rh: 85 }), 0, TH);
  const { alerts } = reconcileAlerts([], f, ctx(1));
  assert.equal(overallStatus([]), 'normal');
  assert.equal(overallStatus(alerts), 'critical');
  assert.equal(overallStatus(alerts.map((a) => ({ ...a, status: 'resolved' as const }))), 'normal');
});
