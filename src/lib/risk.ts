/**
 * Transparent, rule-based risk logic for the AeroFresh demo. NOT an AI model.
 *
 * - All thresholds are ILLUSTRATIVE and UNVALIDATED.
 * - Ambient relative humidity and grain moisture are different quantities. Grain
 *   moisture is only ever evaluated when it was actually measured/supplied; it is
 *   never inferred from ambient humidity.
 * - Temperature/humidity readings cannot detect insects, mould or aflatoxin. Rules
 *   only flag conditions that may favour such problems and recommend verification.
 *
 * Pure functions only, so they can be unit-tested.
 */
import type { Alert, Finding, Reading, RiskLevel, RuleId, Severity, Thresholds } from './types';

export const DEFAULT_THRESHOLDS: Thresholds = {
  humidityWarn: 70,
  humidityCritical: 80,
  alertPersistSeconds: 6,
  tempWarn: 30,
  tempCritical: 35,
  tempTrendRise: 2,
  tempTrendWindow: 6,
  moistureWarn: 13.5,
  moistureCritical: 15.5,
  staleReadings: 3,
  cooldownTicks: 20,
};

export const THRESHOLD_FIELDS: { key: keyof Thresholds; label: string; unit: string; step: number }[] = [
  { key: 'humidityWarn', label: 'Ambient RH – warning', unit: '%', step: 1 },
  { key: 'humidityCritical', label: 'Ambient RH – critical', unit: '%', step: 1 },
  { key: 'alertPersistSeconds', label: 'Condition must persist for', unit: 'seconds', step: 1 },
  { key: 'tempWarn', label: 'Temperature – warning', unit: '°C', step: 0.5 },
  { key: 'tempCritical', label: 'Temperature – critical', unit: '°C', step: 0.5 },
  { key: 'tempTrendRise', label: 'Temperature trend: rise of', unit: '°C', step: 0.5 },
  { key: 'tempTrendWindow', label: '…within', unit: 'readings', step: 1 },
  { key: 'moistureWarn', label: 'Grain moisture – warning', unit: '%', step: 0.1 },
  { key: 'moistureCritical', label: 'Grain moisture – critical', unit: '%', step: 0.1 },
  { key: 'staleReadings', label: 'Sensor offline after', unit: 'missed readings', step: 1 },
  { key: 'cooldownTicks', label: 'Alert cooldown after resolve', unit: 'readings', step: 1 },
];

export const RULE_LABELS: Record<RuleId, string> = {
  humidity: 'Persistent high ambient humidity',
  temperature: 'High or rapidly rising temperature',
  moisture: 'High measured grain moisture',
  offline: 'Sensor offline / stale readings',
};

const ACTION = {
  meter: 'Verify grain moisture using a suitable moisture meter.',
  insects: 'Inspect maize for insect damage.',
  leaks: 'Check for leaks, condensation and poor ventilation.',
  dry: 'Dry maize appropriately before storage when required.',
  testing: 'Arrange qualified testing if mould or mycotoxin contamination is suspected.',
};

const RANK: Record<Severity, number> = { warning: 1, critical: 2 };
export const severityRank = (s: Severity) => RANK[s];

const r1 = (n: number) => Math.round(n * 10) / 10;
const last = <T,>(a: T[]): T | undefined => a[a.length - 1];
export const lastValid = (h: Reading[]) => [...h].reverse().find((r) => !r.offline);

/** Evaluate all rules against the bounded reading history. Returns the conditions that currently hold. */
export function evaluateRules(history: Reading[], missedTicks: number, th: Thresholds): Finding[] {
  const out: Finding[] = [];

  // 1. Persistent high AMBIENT humidity (not grain moisture).
  const currentReading = last(history);
  const latest = currentReading && !currentReading.offline ? currentReading : undefined;
  if (latest && latest.rh !== null && latest.rh >= th.humidityWarn) {
    const critical = (latest.rh as number) >= th.humidityCritical;
    out.push({
      ruleId: 'humidity',
      severity: critical ? 'critical' : 'warning',
      trigger: `Ambient RH ${latest.rh}%`,
      triggerAt: latest.t,
      reason:
        `Ambient relative humidity is at or above ${th.humidityWarn}% (latest ${latest.rh}%).` +
        ` This is air humidity, not grain moisture; it only indicates conditions that may favour moisture uptake.`,
      actions: [ACTION.meter, ACTION.leaks, ACTION.insects, ACTION.testing],
    });
  }

  // 2. Temperature level or unusually fast rise.
  const lv = latest;
  if (lv && lv.temp !== null) {
    const t = lv.temp;
    let severity: Severity | null = null;
    const reasons: string[] = [];
    if (t >= th.tempCritical) {
      severity = 'critical';
      reasons.push(`Temperature ${t}°C is at or above the ${th.tempCritical}°C critical limit.`);
    } else if (t >= th.tempWarn) {
      severity = 'warning';
      reasons.push(`Temperature ${t}°C is at or above the ${th.tempWarn}°C warning limit.`);
    }
    const tw = Math.max(2, Math.round(th.tempTrendWindow));
    const win = history.slice(-tw);
    if (win.length === tw && win.every((r) => !r.offline && r.temp !== null)) {
      const rise = (win[tw - 1].temp as number) - (win[0].temp as number);
      if (rise >= th.tempTrendRise) {
        severity = severity ?? 'warning';
        reasons.push(`Temperature rose ${r1(rise)}°C over the last ${tw} readings (trend limit ${th.tempTrendRise}°C).`);
      }
    }
    if (severity) {
      out.push({
        ruleId: 'temperature',
        severity,
        trigger: `Temperature ${t}°C`,
        triggerAt: lv.t,
        reason: reasons.join(' ') + ' Warm storage conditions may favour insect activity and quality loss; the sensor cannot detect either directly.',
        actions: [ACTION.leaks, ACTION.insects, ACTION.meter],
      });
    }
  }

  // 3. Measured grain moisture – only if the scenario supplied a measurement.
  if (lv && lv.moisture !== null) {
    const m = lv.moisture;
    const severity: Severity | null = m >= th.moistureCritical ? 'critical' : m >= th.moistureWarn ? 'warning' : null;
    if (severity) {
      const limit = severity === 'critical' ? th.moistureCritical : th.moistureWarn;
      out.push({
        ruleId: 'moisture',
        severity,
        trigger: `Grain moisture ${m}%`,
        triggerAt: lv.t,
        reason: `Measured grain moisture ${m}% is at or above the illustrative ${limit}% limit. This value comes from a grain-moisture measurement, not from ambient humidity. Confirm it with a calibrated meter.`,
        actions: [ACTION.meter, ACTION.dry, ACTION.insects, ACTION.testing],
      });
    }
  }

  // 4. Sensor offline / stale.
  if (missedTicks >= th.staleReadings) {
    out.push({
      ruleId: 'offline',
      severity: missedTicks >= th.staleReadings * 3 ? 'critical' : 'warning',
      trigger: `No reading for ${missedTicks} consecutive intervals`,
      triggerAt: last(history)?.t ?? 0,
      reason: `No valid sensor reading for ${missedTicks} intervals (limit ${th.staleReadings}). The displayed values are stale, so the real storage condition is unknown.`,
      actions: [
        'Check sensor power, battery and connection (simulated here).',
        'Inspect the store manually until readings resume.',
        ACTION.meter,
      ],
    });
  }
  return out;
}

export interface ReconcileCtx {
  tick: number;
  now: number;
  unitId: string;
  unitName: string;
  cooldownTicks: number;
}
export type EventInput = { kind: 'alert' | 'resolve'; message: string; action?: string };

/**
 * Deduplicate findings against existing alerts.
 * - One unresolved alert per (rule, unit): a persisting condition updates it instead of creating another.
 * - Severity can escalate (alert returns to "active"); it never de-escalates silently.
 * - When a condition clears, its alert is auto-resolved.
 * - After resolution, the same rule cannot re-alert until the cooldown has elapsed.
 */
export function reconcileAlerts(alerts: Alert[], findings: Finding[], ctx: ReconcileCtx) {
  const out = alerts.map((a) => ({ ...a }));
  const events: EventInput[] = [];

  for (const f of findings) {
    const open = out.find((a) => a.ruleId === f.ruleId && a.unitId === ctx.unitId && a.status !== 'resolved');
    if (open) {
      open.lastSeenTick = ctx.tick;
      open.occurrences += 1;
      if (severityRank(f.severity) > severityRank(open.severity)) {
        Object.assign(open, { severity: f.severity, reason: f.reason, trigger: f.trigger, triggerAt: f.triggerAt, actions: f.actions });
        open.status = 'active';
        delete open.acknowledgedAt;
        events.push({ kind: 'alert', message: `Escalated to ${f.severity.toUpperCase()}: ${RULE_LABELS[f.ruleId]}`, action: f.actions[0] });
      }
      continue;
    }
    const lastResolvedTick = out
      .filter((a) => a.ruleId === f.ruleId && a.unitId === ctx.unitId && a.resolvedTick !== undefined)
      .reduce((m, a) => Math.max(m, a.resolvedTick as number), -Infinity);
    if (ctx.tick - lastResolvedTick < ctx.cooldownTicks) continue; // cooling down

    out.push({
      ...f,
      id: `${f.ruleId}-${ctx.tick}`,
      unitId: ctx.unitId,
      unitName: ctx.unitName,
      status: 'active',
      raisedAt: ctx.now,
      raisedTick: ctx.tick,
      lastSeenTick: ctx.tick,
      occurrences: 1,
    });
    events.push({ kind: 'alert', message: `${f.severity.toUpperCase()} alert: ${RULE_LABELS[f.ruleId]}`, action: f.actions[0] });
  }

  for (const a of out) {
    if (a.status !== 'resolved' && a.unitId === ctx.unitId && !findings.some((f) => f.ruleId === a.ruleId)) {
      a.status = 'resolved';
      a.resolvedAt = ctx.now;
      a.resolvedTick = ctx.tick;
      a.resolvedBy = 'auto';
      events.push({ kind: 'resolve', message: `Condition no longer detected, alert auto-resolved: ${RULE_LABELS[a.ruleId]}` });
    }
  }
  return { alerts: out, events };
}

/** Overall status from unresolved alerts. "Normal" only means no demo rule is triggered. */
export function overallStatus(alerts: Alert[]): RiskLevel {
  const open = alerts.filter((a) => a.status !== 'resolved');
  if (open.some((a) => a.severity === 'critical')) return 'critical';
  return open.length ? 'warning' : 'normal';
}
