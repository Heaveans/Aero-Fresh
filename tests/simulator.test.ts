import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SIM, SCENARIOS, stepSim, type Noise } from '../src/lib/simulator';
import { HISTORY_MAX, initState, reducer } from '../src/lib/store';
import { sanitize } from '../src/lib/storage';
import type { Alert, ScenarioId, SimState } from '../src/lib/types';

const Z: Noise = [0, 0, 0];
const run = (sim: SimState, sc: ScenarioId, n: number, fan = false) => {
  const readings = [];
  for (let i = 0; i < n; i++) {
    const r = stepSim(sim, sc, fan, Z, i * 2500);
    sim = r.sim;
    readings.push(r.reading);
  }
  return { sim, readings };
};

test('rising humidity changes gradually and never jumps', () => {
  const { readings } = run(INITIAL_SIM, 'rising_humidity', 25);
  for (let i = 1; i < readings.length; i++) assert.ok(Math.abs(readings[i].rh! - readings[i - 1].rh!) <= 2.0001);
  assert.ok(readings[24].rh! >= 90);
  assert.equal(readings[0].moisture, null, 'no grain-moisture measurement in this scenario');
});

test('rising temperature climbs gradually', () => {
  const { readings } = run(INITIAL_SIM, 'rising_temperature', 30);
  for (let i = 1; i < readings.length; i++) assert.ok(readings[i].temp! - readings[i - 1].temp! <= 0.5001);
  assert.ok(readings[29].temp! > 35);
});

test('high grain moisture scenario supplies a rising measurement', () => {
  const { readings } = run(INITIAL_SIM, 'high_grain_moisture', 30);
  assert.ok(readings.every((r) => r.moisture !== null));
  assert.ok(readings[29].moisture! > readings[0].moisture!);
  assert.ok(readings[29].moisture! <= 16.5);
});

test('sensor offline emits gap readings and counts missed intervals; resumes cleanly', () => {
  const off = run(INITIAL_SIM, 'sensor_offline', 4);
  assert.ok(off.readings.every((r) => r.offline && r.temp === null && r.rh === null));
  assert.equal(off.sim.missedTicks, 4);
  const back = run(off.sim, 'normal', 1);
  assert.equal(back.sim.missedTicks, 0);
  assert.equal(back.readings[0].offline, false);
});

test('recovery only improves readings while the simulated fan is ON', () => {
  const hot = { ...INITIAL_SIM, temp: 38, rh: 90, moisture: 15 };
  const fanOff = run(hot, 'recovery', 10, false).sim;
  assert.equal(fanOff.temp, 38);
  assert.equal(fanOff.rh, 90);
  const fanOn = run(hot, 'recovery', 10, true).sim;
  assert.ok(fanOn.temp < 38 && fanOn.rh < 90);
  assert.equal(fanOn.moisture, 15, 'fan does not change grain moisture');
  const done = run(hot, 'recovery', 40, true).sim;
  assert.equal(done.temp, 24);
  assert.equal(done.rh, 60);
});

test('fan corrects rising scenario readings without changing measured grain moisture', () => {
  const hot = { ...INITIAL_SIM, temp: 36, rh: 85, moisture: 15 };
  const fanOn = run(hot, 'high_grain_moisture', 5, true).sim;
  const fanOff = run(hot, 'high_grain_moisture', 5, false).sim;
  assert.ok(fanOn.temp < fanOff.temp);
  assert.ok(fanOn.rh < fanOff.rh);
  assert.equal(fanOn.moisture, fanOff.moisture);
});

test('every scenario is defined', () => {
  assert.equal(Object.keys(SCENARIOS).length, 6);
});

test('reducer keeps history bounded and never duplicates an unresolved humidity alert', () => {
  let s = reducer(initState({ scenario: 'rising_humidity' }), { type: 'start' });
  for (let i = 0; i < 150; i++) s = reducer(s, { type: 'tick', now: i * 2500, noise: Z });
  assert.equal(s.history.length, HISTORY_MAX);
  const humidity = s.alerts.filter((a) => a.ruleId === 'humidity' && a.status !== 'resolved');
  assert.ok(humidity.length <= 1);
  assert.ok(s.alerts.some((alert) => alert.ruleId === 'humidity'));
  if (humidity[0]) assert.equal(humidity[0].severity, 'critical');
});

test('alerts wait for six continuous seconds and a cleared condition restarts the delay', () => {
  let s = initState({
    scenario: 'rising_humidity',
    sim: { ...INITIAL_SIM, rh: 75 },
  });
  const tick = (now: number) => { s = reducer(s, { type: 'tick', now, noise: Z }); };
  tick(0);
  tick(2000);
  tick(4000);
  assert.equal(s.alerts.length, 0);
  tick(6000);
  assert.equal(s.alerts.length, 1, 'alert is raised after six continuous seconds');

  s = initState({ scenario: 'rising_humidity', sim: { ...INITIAL_SIM, rh: 75 } });
  tick(0);
  s = reducer(s, { type: 'setScenario', id: 'sensor_offline', now: 2500 });
  tick(2500);
  s = reducer(s, { type: 'setScenario', id: 'rising_humidity', now: 5000 });
  tick(5000);
  tick(7500);
  tick(10000);
  assert.equal(s.alerts.filter((alert) => alert.ruleId === 'humidity').length, 0, 'offline gap resets the continuous-condition timer');

  s = initState({ scenario: 'rising_humidity', sim: { ...INITIAL_SIM, rh: 75 } });
  s = reducer(s, { type: 'tick', now: 0, noise: Z });
  s = reducer(s, { type: 'tick', now: 7000, noise: Z });
  assert.equal(s.alerts.length, 0, 'a long pause between readings restarts the persistence window');
  s = reducer(s, { type: 'tick', now: 9000, noise: Z });
  s = reducer(s, { type: 'tick', now: 11000, noise: Z });
  assert.equal(s.alerts.length, 0);
  s = reducer(s, { type: 'tick', now: 13000, noise: Z });
  assert.equal(s.alerts.length, 1);
});

test('manual fan uses a ten-second run with no alert and stops at expiry', () => {
  let s = reducer(initState(), { type: 'fan', command: 'ON', now: 5000 });
  assert.equal(s.fanUntilAt, 15_000);
  assert.equal(s.interventions[0].durationSeconds, 10);
  s = reducer(s, { type: 'fanTimeout', now: 15_000 });
  assert.equal(s.fanOn, false);
});

test('automatic fan starts ten seconds after an eligible alert and stops below warning thresholds', () => {
  let s = initState({
    scenario: 'rising_humidity',
    sim: { ...INITIAL_SIM, rh: 90 },
  });
  const tick = (now: number) => { s = reducer(s, { type: 'tick', now, noise: Z }); };
  for (let now = 0; now <= 16000; now += 2000) tick(now);
  const alert = s.alerts.find((item) => item.ruleId === 'humidity');
  assert.ok(alert);
  assert.equal(alert.raisedAt, 6000);
  assert.equal(s.fanMode, 'automatic');
  assert.equal(s.interventions[0].source, 'automatic');
  assert.equal(s.interventions[0].durationSeconds, undefined, 'automatic runtime is condition-driven');

  for (let now = 18000; now <= 70000 && s.fanOn; now += 2000) tick(now);
  assert.equal(s.fanOn, false);
  assert.equal(s.fanMode, 'off');
  assert.ok(s.sim.rh < s.thresholds.humidityWarn);
});

test('manual fan runtime follows criticality and expires even if simulation ticks continue', () => {
  const finding = {
    ruleId: 'temperature' as const,
    severity: 'critical' as const,
    reason: 'critical test alert',
    trigger: 'Temperature 36°C',
    triggerAt: 0,
    actions: [],
  };
  const critical: Alert = {
    ...finding,
    id: 'temperature-test',
    unitId: 'SU-01',
    unitName: 'Store A',
    status: 'active',
    raisedAt: 0,
    raisedTick: 0,
    lastSeenTick: 0,
    occurrences: 1,
  };
  let s = initState({ scenario: 'rising_temperature', alerts: [critical] });
  s = reducer(s, { type: 'fan', command: 'ON', now: 0 });
  assert.equal(s.fanUntilAt, 30_000);
  assert.equal(s.interventions[0].durationSeconds, 30);
  s = reducer(s, { type: 'tick', now: 30_000, noise: Z });
  assert.equal(s.fanOn, false);
  assert.equal(s.interventions[0].command, 'OFF');
});

test('end-to-end: alert → acknowledge → fan ON in recovery → condition clears and auto-resolves', () => {
  let s = initState({ scenario: 'rising_humidity' });
  let now = 0;
  const tick = (n: number) => { for (let i = 0; i < n; i++) s = reducer(s, { type: 'tick', now: (now += 2500), noise: Z }); };
  tick(15);
  const alert = s.alerts.find((a) => a.ruleId === 'humidity' && a.status === 'active')!;
  assert.ok(alert);
  s = reducer(s, { type: 'ack', id: alert.id, now });
  assert.equal(s.alerts.find((a) => a.id === alert.id)!.status, 'acknowledged');
  s = reducer(s, { type: 'setScenario', id: 'recovery', now });
  s = reducer(s, { type: 'fan', command: 'ON', now });
  assert.equal(s.fanOn, true);
  assert.equal(s.interventions[0].command, 'ON');
  tick(30);
  assert.equal(s.alerts.find((a) => a.id === alert.id)!.status, 'resolved');
  assert.equal(s.alerts.find((a) => a.id === alert.id)!.resolvedBy, 'auto');
});

test('resetSim clears readings and alerts but keeps the audit log', () => {
  let s = initState({ scenario: 'rising_humidity' });
  for (let i = 0; i < 15; i++) s = reducer(s, { type: 'tick', now: i * 2500, noise: Z });
  s = reducer(s, { type: 'fan', command: 'ON', now: 1 });
  s = reducer(s, { type: 'resetSim', now: 2 });
  assert.equal(s.history.length, 0);
  assert.equal(s.alerts.length, 0);
  assert.equal(s.fanOn, false);
  assert.ok(s.interventions.length >= 1);
  assert.ok(s.events.length > 0);
});

test('storage: corrupt or malformed data falls back safely', () => {
  assert.deepEqual(sanitize(null), {});
  assert.deepEqual(sanitize('garbage'), {});
  assert.deepEqual(sanitize([1, 2]), {});
  const s = sanitize({
    scenario: 'nope',
    speed: 3,
    thresholds: { humidityWarn: 'x', tempWarn: 31 },
    sim: { tick: 'a' },
    history: [{ bad: true }, 5],
    alerts: [{ id: 1 }],
    events: 'x',
    interventions: [null],
    fanOn: 'yes',
  });
  assert.equal(s.scenario, undefined);
  assert.equal(s.speed, undefined);
  assert.equal(s.thresholds!.humidityWarn, 70, 'invalid value replaced by default');
  assert.equal(s.thresholds!.tempWarn, 31, 'valid value kept');
  assert.equal(s.sim, undefined);
  assert.deepEqual(s.history, []);
  assert.deepEqual(s.alerts, []);
  assert.equal(s.events, undefined);
  assert.equal(s.fanOn, undefined);
});

test('storage: valid saved state round-trips', () => {
  let s = initState({ scenario: 'rising_humidity' });
  for (let i = 0; i < 12; i++) s = reducer(s, { type: 'tick', now: i * 2500, noise: Z });
  s = reducer(s, { type: 'fan', command: 'ON', now: 5 });
  const { running: _r, ...saved } = s;
  const back = sanitize(JSON.parse(JSON.stringify(saved)));
  assert.equal(back.history!.length, s.history.length);
  assert.equal(back.alerts!.length, s.alerts.length);
  assert.equal(back.interventions!.length, s.interventions.length);
  assert.equal(back.fanOn, true);
  assert.equal(back.fanMode, 'manual');
  assert.equal(back.fanUntilAt, s.fanUntilAt);
  assert.equal(back.scenario, 'rising_humidity');
});
