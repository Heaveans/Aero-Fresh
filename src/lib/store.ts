/** Pure app state + reducer (no React, no browser APIs) so it can be unit-tested. */
import { DEFAULT_THRESHOLDS, RULE_LABELS, evaluateRules, reconcileAlerts, type EventInput } from './risk';
import { BASE_INTERVAL_MS, INITIAL_SIM, SCENARIOS, UNIT_ID, UNIT_NAME, stepSim, type Noise } from './simulator';
import type { Alert, AppEvent, FanCommand, Reading, ScenarioId, SimState, Speed, StorageStore, Thresholds } from './types';

export const HISTORY_MAX = 100;
export const EVENTS_MAX = 100;
export const ALERTS_MAX = 100;
export const INTERVENTIONS_MAX = 100;

export interface AppState {
  scenario: ScenarioId;
  speed: Speed;
  running: boolean; // never persisted: the demo always starts paused
  thresholds: Thresholds;
  sim: SimState;
  history: Reading[];
  alerts: Alert[];
  events: AppEvent[]; // newest first
  interventions: FanCommand[]; // newest first
  fanOn: boolean;
  fanMode: 'off' | 'manual' | 'automatic';
  fanUntilAt: number | null;
  conditionSince: Partial<Record<Alert['ruleId'], number>>;
  autoFanSuppressed: boolean;
  stores: StorageStore[];
  seq: number;
}
export type Persisted = Omit<AppState, 'running'>;

export function initState(p: Partial<Persisted> = {}): AppState {
  return {
    scenario: 'normal',
    speed: 1,
    running: false,
    thresholds: { ...DEFAULT_THRESHOLDS },
    sim: { ...INITIAL_SIM },
    history: [],
    alerts: [],
    events: [],
    interventions: [],
    fanOn: false,
    fanMode: 'off',
    fanUntilAt: null,
    conditionSince: {},
    autoFanSuppressed: false,
    stores: [{ id: 'store-1', name: 'Store 1', bays: [{ id: 'bay-1', name: 'Bay A', unitId: UNIT_ID }] }],
    seq: 0,
    ...p,
  };
}

export type Action =
  | { type: 'tick'; now: number; noise: Noise }
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resetSim'; now: number }
  | { type: 'resetAll' }
  | { type: 'setScenario'; id: ScenarioId; now: number }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'ack'; id: string; now: number }
  | { type: 'resolve'; id: string; now: number }
  | { type: 'fan'; command: 'ON' | 'OFF'; now: number }
  | { type: 'fanTimeout'; now: number }
  | { type: 'addStore'; name: string; now: number }
  | { type: 'addBay'; storeId: string; name: string; now: number }
  | { type: 'setThreshold'; key: keyof Thresholds; value: number }
  | { type: 'resetThresholds' };

function withEvents(s: AppState, evs: EventInput[] | { kind: AppEvent['kind']; message: string; action?: string }[], now: number) {
  let seq = s.seq;
  const made: AppEvent[] = evs.map((e) => ({ ...e, t: now, id: `e${++seq}` }));
  return { events: [...made.reverse(), ...s.events].slice(0, EVENTS_MAX), seq };
}

/** Keep the alert list bounded by dropping the oldest resolved alerts first. */
function capAlerts(a: Alert[]) {
  let extra = a.length - ALERTS_MAX;
  if (extra <= 0) return a;
  return a.filter((x) => (extra > 0 && x.status === 'resolved' ? (extra--, false) : true));
}

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'tick': {
      if (s.fanMode === 'manual' && s.fanUntilAt !== null && a.now >= s.fanUntilAt) {
        return reducer(turnFanOff(s, a.now, 'Manual fan runtime ended; fan set to OFF.'), a);
      }
      const { sim, reading } = stepSim(s.sim, s.scenario, s.fanOn, a.noise, a.now);
      const history = [...s.history, reading].slice(-HISTORY_MAX);
      const detected = evaluateRules(history, sim.missedTicks, s.thresholds);
      const detectedRules = new Set(detected.map((finding) => finding.ruleId));
      const previousReading = s.history.at(-1);
      const hasReadingGap = previousReading !== undefined && a.now - previousReading.t > BASE_INTERVAL_MS * 2;
      const conditionSince = hasReadingGap ? {} : { ...s.conditionSince };
      for (const ruleId of Object.keys(conditionSince) as (keyof typeof conditionSince)[]) {
        if (!detectedRules.has(ruleId)) delete conditionSince[ruleId];
      }
      for (const finding of detected) conditionSince[finding.ruleId] ??= a.now;
      const persistenceMs = Math.max(0, s.thresholds.alertPersistSeconds) * 1000;
      const findings = detected.filter((finding) => a.now - (conditionSince[finding.ruleId] ?? a.now) >= persistenceMs);
      const rec = reconcileAlerts(s.alerts, findings, {
        tick: sim.tick,
        now: a.now,
        unitId: UNIT_ID,
        unitName: UNIT_NAME,
        cooldownTicks: s.thresholds.cooldownTicks,
      });
      const next: AppState = {
        ...s,
        sim,
        history,
        conditionSince,
        autoFanSuppressed: detected.some((finding) => finding.ruleId === 'temperature' || finding.ruleId === 'humidity')
          ? s.autoFanSuppressed
          : false,
        alerts: capAlerts(rec.alerts),
        ...withEvents(s, rec.events, a.now),
      };
      const valid = [...history].reverse().find((item) => !item.offline && item.temp !== null && item.rh !== null);
      const optimal = Boolean(valid && valid.temp! < s.thresholds.tempWarn && valid.rh! < s.thresholds.humidityWarn);

      if (next.fanMode === 'automatic' && optimal) {
        return turnFanOff(next, a.now, 'Automatic ventilation stopped: temperature and humidity are below warning thresholds.');
      }
      const relevantAlert = next.alerts.find((alert) =>
        (alert.ruleId === 'temperature' || alert.ruleId === 'humidity') &&
        alert.status !== 'resolved' &&
        a.now - alert.raisedAt >= 10_000,
      );
      if (!next.fanOn && !next.autoFanSuppressed && relevantAlert) return turnFanOn(next, a.now, 'automatic');
      return next;
    }
    case 'start':
      return { ...s, running: true };
    case 'pause':
      return { ...s, running: false };
    case 'resetSim':
      // New run: clears readings, alerts and the fan. Audit logs (events, interventions) are kept.
      return {
        ...s,
        running: false,
        sim: { ...INITIAL_SIM },
        history: [],
        alerts: [],
        fanOn: false,
        fanMode: 'off',
        fanUntilAt: null,
        conditionSince: {},
        autoFanSuppressed: false,
        ...withEvents(s, [{ kind: 'system', message: 'Simulator reset: readings and alerts cleared, fan set to OFF.' }], a.now),
      };
    case 'resetAll':
      return initState();
    case 'setScenario':
      if (a.id === s.scenario) return s;
      return { ...s, scenario: a.id, ...withEvents(s, [{ kind: 'scenario', message: `Scenario changed to "${SCENARIOS[a.id].label}".` }], a.now) };
    case 'setSpeed':
      return { ...s, speed: a.speed };
    case 'addStore': {
      const name = a.name.trim();
      if (!name) return s;
      let number = 1;
      while (s.stores.some((store) => store.id === `store-${number}`)) number++;
      const store: StorageStore = { id: `store-${number}`, name, bays: [] };
      return {
        ...s,
        stores: [...s.stores, store],
        ...withEvents(s, [{ kind: 'system', message: `Store added: ${name}.` }], a.now),
      };
    }
    case 'addBay': {
      const name = a.name.trim();
      if (!name) return s;
      const store = s.stores.find((item) => item.id === a.storeId);
      if (!store) return s;
      const nextNumber = store.bays.reduce((max, bay) => {
        const match = /^bay-(\d+)$/.exec(bay.id);
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0) + 1;
      const bayName = store.bays.some((bay) => bay.name.toLocaleLowerCase() === name.toLocaleLowerCase())
        ? `${name} (${nextNumber})`
        : name;
      return {
        ...s,
        stores: s.stores.map((item) =>
          item.id === a.storeId
            ? { ...item, bays: [...item.bays, { id: `bay-${nextNumber}`, name: bayName }] }
            : item,
        ),
        ...withEvents(s, [{ kind: 'system', message: `Bay added to ${store.name}: ${bayName}.` }], a.now),
      };
    }
    case 'ack':
      return {
        ...s,
        alerts: s.alerts.map((x) => (x.id === a.id && x.status === 'active' ? { ...x, status: 'acknowledged' as const, acknowledgedAt: a.now } : x)),
        ...withEvents(s, [{ kind: 'ack', message: `Alert acknowledged: ${labelOf(s, a.id)}` }], a.now),
      };
    case 'resolve':
      return {
        ...s,
        alerts: s.alerts.map((x) =>
          x.id === a.id && x.status !== 'resolved' ? { ...x, status: 'resolved' as const, resolvedAt: a.now, resolvedTick: s.sim.tick, resolvedBy: 'user' as const } : x,
        ),
        ...withEvents(s, [{ kind: 'resolve', message: `Alert resolved by user: ${labelOf(s, a.id)}` }], a.now),
      };
    case 'fan': {
      if (a.command === 'OFF') {
        const next = turnFanOff(s, a.now, 'Manual fan OFF command recorded.');
        return { ...next, autoFanSuppressed: true };
      }
      const hasCriticalAlert = s.alerts.some((alert) => alert.status !== 'resolved' && alert.severity === 'critical');
      const hasWarningAlert = s.alerts.some((alert) => alert.status !== 'resolved');
      const durationSeconds = hasCriticalAlert ? 30 : hasWarningAlert ? 10 : 10;
      return turnFanOn(s, a.now, 'manual', durationSeconds);
    }
    case 'fanTimeout':
      if (s.fanMode !== 'manual' || s.fanUntilAt === null || a.now < s.fanUntilAt) return s;
      return turnFanOff(s, a.now, 'Manual fan runtime ended; fan set to OFF.');
    case 'setThreshold':
      return Number.isFinite(a.value) && a.value >= 0 ? { ...s, thresholds: { ...s.thresholds, [a.key]: a.value } } : s;
    case 'resetThresholds':
      return { ...s, thresholds: { ...DEFAULT_THRESHOLDS } };
  }
}

function turnFanOn(s: AppState, now: number, source: 'manual' | 'automatic', durationSeconds?: number): AppState {
  const cmd: FanCommand = {
    id: `f${s.seq + 1}`,
    t: now,
    command: 'ON',
    scenario: s.scenario,
    source,
    ...(durationSeconds === undefined ? {} : { durationSeconds }),
  };
  const runtime = durationSeconds === undefined ? 'until readings return below warning thresholds' : `for ${durationSeconds} seconds`;
  return {
    ...s,
    fanOn: true,
    fanMode: source,
    fanUntilAt: durationSeconds === undefined ? null : now + durationSeconds * 1000,
    interventions: [cmd, ...s.interventions].slice(0, INTERVENTIONS_MAX),
    ...withEvents(s, [{ kind: 'fan', message: `Simulated ${source} fan ON ${runtime}. No physical device is connected.` }], now),
  };
}

function turnFanOff(s: AppState, now: number, message: string): AppState {
  if (!s.fanOn) return { ...s, fanMode: 'off', fanUntilAt: null };
  const cmd: FanCommand = {
    id: `f${s.seq + 1}`,
    t: now,
    command: 'OFF',
    scenario: s.scenario,
    source: s.fanMode === 'automatic' ? 'automatic' : 'system',
  };
  return {
    ...s,
    fanOn: false,
    fanMode: 'off',
    fanUntilAt: null,
    interventions: [cmd, ...s.interventions].slice(0, INTERVENTIONS_MAX),
    ...withEvents(s, [{ kind: 'fan', message: `${message} No physical device is connected.` }], now),
  };
}

function labelOf(s: AppState, id: string) {
  const al = s.alerts.find((x) => x.id === id);
  return al ? RULE_LABELS[al.ruleId] : id;
}
