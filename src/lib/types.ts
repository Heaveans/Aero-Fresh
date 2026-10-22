export type ScenarioId =
  | 'normal'
  | 'rising_humidity'
  | 'rising_temperature'
  | 'high_grain_moisture'
  | 'sensor_offline'
  | 'recovery';

export type Severity = 'warning' | 'critical';
export type RiskLevel = 'normal' | 'warning' | 'critical';
export type RuleId = 'humidity' | 'temperature' | 'moisture' | 'offline';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export type Speed = 1 | 2 | 4;

/** One simulated sensor reading. Offline ticks are stored as gaps (null values). */
export interface Reading {
  t: number; // epoch ms
  tick: number;
  unitId: string;
  temp: number | null; // °C
  rh: number | null; // ambient relative humidity, %
  moisture: number | null; // measured grain moisture, % (only when the scenario supplies it)
  offline: boolean;
}

/** Hidden "true" state of the simulated store, evolved by the simulator. */
export interface SimState {
  tick: number;
  temp: number;
  rh: number;
  moisture: number | null;
  missedTicks: number; // consecutive intervals with no reading
}

/** Illustrative, UNVALIDATED demo thresholds. */
export interface Thresholds {
  humidityWarn: number; // % ambient RH
  humidityCritical: number;
  alertPersistSeconds: number; // continuous condition duration before an alert is raised
  tempWarn: number; // °C
  tempCritical: number;
  tempTrendRise: number; // °C rise within the trend window
  tempTrendWindow: number; // readings
  moistureWarn: number; // % measured grain moisture
  moistureCritical: number;
  staleReadings: number; // missed intervals before "sensor offline"
  cooldownTicks: number; // ticks before a resolved alert may be raised again
}

export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  reason: string;
  trigger: string; // the triggering reading, as text
  triggerAt: number;
  actions: string[];
}

export interface Alert extends Finding {
  id: string;
  unitId: string;
  unitName: string;
  status: AlertStatus;
  raisedAt: number;
  raisedTick: number;
  lastSeenTick: number;
  occurrences: number; // how many ticks the condition has persisted (deduplicated)
  acknowledgedAt?: number;
  resolvedAt?: number;
  resolvedTick?: number;
  resolvedBy?: 'user' | 'auto';
}

export type EventKind = 'alert' | 'ack' | 'resolve' | 'fan' | 'scenario' | 'system';

export interface AppEvent {
  id: string;
  t: number;
  kind: EventKind;
  message: string;
  action?: string;
}

export interface FanCommand {
  id: string;
  t: number;
  command: 'ON' | 'OFF';
  scenario: ScenarioId;
  source?: 'manual' | 'automatic' | 'system';
  durationSeconds?: number;
}

export interface StorageBay {
  id: string;
  name: string;
  unitId?: string;
}

export interface StorageStore {
  id: string;
  name: string;
  bays: StorageBay[];
}
