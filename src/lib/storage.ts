/** localStorage persistence. Anything missing or corrupt falls back to defaults. */
import { DEFAULT_THRESHOLDS } from './risk';
import { SCENARIOS } from './simulator';
import { ALERTS_MAX, EVENTS_MAX, HISTORY_MAX, INTERVENTIONS_MAX, type AppState, type Persisted } from './store';
import type { Alert, AppEvent, FanCommand, Reading, ScenarioId, SimState, Speed, Thresholds } from './types';

const KEY = 'aerofresh-maize-demo:v1';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown) => v === null || isNum(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

const isReading = (v: unknown): v is Reading =>
  isObj(v) && isNum(v.t) && isNum(v.tick) && isStr(v.unitId) && isNumOrNull(v.temp) && isNumOrNull(v.rh) && isNumOrNull(v.moisture) && typeof v.offline === 'boolean';

const isAlert = (v: unknown): v is Alert =>
  isObj(v) &&
  isStr(v.id) && isStr(v.unitId) && isStr(v.unitName) && isStr(v.reason) && isStr(v.trigger) &&
  ['humidity', 'temperature', 'moisture', 'offline'].includes(v.ruleId as string) &&
  ['warning', 'critical'].includes(v.severity as string) &&
  ['active', 'acknowledged', 'resolved'].includes(v.status as string) &&
  isNum(v.triggerAt) && isNum(v.raisedAt) && isNum(v.raisedTick) && isNum(v.lastSeenTick) && isNum(v.occurrences) &&
  Array.isArray(v.actions) && v.actions.every(isStr);

const isEvent = (v: unknown): v is AppEvent =>
  isObj(v) && isStr(v.id) && isNum(v.t) && isStr(v.message) && ['alert', 'ack', 'resolve', 'fan', 'scenario', 'system'].includes(v.kind as string);

const isFan = (v: unknown): v is FanCommand =>
  isObj(v) && isStr(v.id) && isNum(v.t) && (v.command === 'ON' || v.command === 'OFF') && isStr(v.scenario) && v.scenario in SCENARIOS &&
  (v.source === undefined || ['manual', 'automatic', 'system'].includes(v.source as string)) &&
  (v.durationSeconds === undefined || isNum(v.durationSeconds));

/** Validate untrusted stored data field-by-field; invalid fields are simply omitted. */
export function sanitize(raw: unknown): Partial<Persisted> {
  if (!isObj(raw)) return {};
  const out: Partial<Persisted> = {};
  if (isStr(raw.scenario) && raw.scenario in SCENARIOS) out.scenario = raw.scenario as ScenarioId;
  if (raw.speed === 1 || raw.speed === 2 || raw.speed === 4) out.speed = raw.speed as Speed;
  if (isObj(raw.thresholds)) {
    const th: Thresholds = { ...DEFAULT_THRESHOLDS };
    for (const k of Object.keys(th) as (keyof Thresholds)[]) {
      const v = (raw.thresholds as Record<string, unknown>)[k];
      if (isNum(v) && v >= 0) th[k] = v;
    }
    out.thresholds = th;
  }
  const s = raw.sim;
  if (isObj(s) && isNum(s.tick) && isNum(s.temp) && isNum(s.rh) && isNumOrNull(s.moisture) && isNum(s.missedTicks)) {
    out.sim = { tick: s.tick, temp: s.temp, rh: s.rh, moisture: s.moisture as number | null, missedTicks: s.missedTicks } as SimState;
  }
  if (Array.isArray(raw.history)) out.history = raw.history.filter(isReading).slice(-HISTORY_MAX);
  if (Array.isArray(raw.alerts)) out.alerts = raw.alerts.filter(isAlert).slice(-ALERTS_MAX);
  if (Array.isArray(raw.events)) out.events = raw.events.filter(isEvent).slice(0, EVENTS_MAX);
  if (Array.isArray(raw.interventions)) out.interventions = raw.interventions.filter(isFan).slice(0, INTERVENTIONS_MAX);
  if (typeof raw.fanOn === 'boolean') out.fanOn = raw.fanOn;
  if (raw.fanMode === 'off' || raw.fanMode === 'manual' || raw.fanMode === 'automatic') out.fanMode = raw.fanMode;
  else if (raw.fanOn === true) out.fanMode = 'manual';
  if (raw.fanUntilAt === null || isNum(raw.fanUntilAt)) out.fanUntilAt = raw.fanUntilAt;
  if (typeof raw.autoFanSuppressed === 'boolean') out.autoFanSuppressed = raw.autoFanSuppressed;
  if (isObj(raw.conditionSince)) {
    const since: NonNullable<Persisted['conditionSince']> = {};
    for (const id of ['humidity', 'temperature', 'moisture', 'offline'] as const) {
      const value = raw.conditionSince[id];
      if (isNum(value)) since[id] = value;
    }
    out.conditionSince = since;
  }
  if (isNum(raw.seq)) out.seq = raw.seq;
  return out;
}

export function loadPersisted(): Partial<Persisted> {
  try {
    const txt = localStorage.getItem(KEY);
    return txt ? sanitize(JSON.parse(txt)) : {};
  } catch {
    return {}; // unavailable storage or invalid JSON
  }
}

export function savePersisted(s: AppState) {
  try {
    const { running: _running, ...rest } = s;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* storage full or blocked: the demo keeps working in memory */
  }
}

export function clearPersisted() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
