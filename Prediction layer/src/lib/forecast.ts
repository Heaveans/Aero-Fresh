/**
 * Trend projection ("time-to-threshold"). A straight-line least-squares fit over the most recent
 * contiguous valid readings, extrapolated forward. This is NOT a trained model and NOT a validated
 * prediction. It is display-only: it never creates alerts. It declines to project when the data is
 * too short, flat, falling, noisy or stale. Pure functions, unit-tested.
 */
import type { Reading, Thresholds } from './types';

export type Metric = 'temp' | 'rh' | 'moisture';
export type FcStatus = 'ok' | 'insufficient' | 'flat' | 'falling' | 'poor_fit' | 'stale';
export type Confidence = 'low' | 'medium' | 'high';

export interface Forecast {
  metric: Metric;
  label: string;
  unit: string;
  status: FcStatus;
  slope: number; // units per reading (0 when not computed)
  r2: number;
  n: number; // readings used in the fit
  confidence: Confidence;
  latest: number | null;
  warn: number;
  critical: number;
  toWarn: number | null; // readings until the warning limit (0 = already reached, null = none within horizon)
  toCritical: number | null;
  projected: number[]; // next HORIZON values (only when status is 'ok')
}

export const WINDOW = 12; // most recent readings used for the fit
export const MIN_POINTS = 6;
export const HORIZON = 10; // projected points drawn on the chart
export const SEARCH = 60; // how far ahead a crossing is reported
export const MIN_R2 = 0.6;

const META: Record<Metric, { label: string; unit: string; minSlope: number; cap: number }> = {
  temp: { label: 'Temperature', unit: '°C', minSlope: 0.05, cap: 45 },
  rh: { label: 'Ambient humidity', unit: '%', minSlope: 0.2, cap: 100 },
  moisture: { label: 'Grain moisture', unit: '%', minSlope: 0.02, cap: 25 },
};
export const METRICS: Metric[] = ['temp', 'rh', 'moisture'];

const limitsFor = (m: Metric, th: Thresholds) =>
  m === 'temp' ? { warn: th.tempWarn, critical: th.tempCritical }
  : m === 'rh' ? { warn: th.humidityWarn, critical: th.humidityCritical }
  : { warn: th.moistureWarn, critical: th.moistureCritical };

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Most recent contiguous valid values (stops at the first offline gap). */
function trailing(history: Reading[], m: Metric): number[] {
  const out: number[] = [];
  for (let i = history.length - 1; i >= 0 && out.length < WINDOW; i--) {
    const v = history[i][m];
    if (history[i].offline || v === null) break;
    out.unshift(v);
  }
  return out;
}

export function regress(y: number[]) {
  const n = y.length;
  const mx = (n - 1) / 2;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  y.forEach((v, i) => { sxx += (i - mx) ** 2; sxy += (i - mx) * (v - my); syy += (v - my) ** 2; });
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssRes = y.reduce((a, v, i) => a + (v - (intercept + slope * i)) ** 2, 0);
  return { slope, intercept, r2: syy === 0 ? 1 : 1 - ssRes / syy };
}

export function forecastMetric(history: Reading[], m: Metric, missedTicks: number, th: Thresholds): Forecast | null {
  const lv = [...history].reverse().find((r) => !r.offline);
  if (m === 'moisture' && (!lv || lv.moisture === null)) return null; // not measured in this scenario

  const meta = META[m];
  const base: Forecast = {
    metric: m, label: meta.label, unit: meta.unit, status: 'insufficient', slope: 0, r2: 0, n: 0,
    confidence: 'low', latest: lv ? lv[m] : null, ...limitsFor(m, th), toWarn: null, toCritical: null, projected: [],
  };
  if (missedTicks >= th.staleReadings) return { ...base, status: 'stale' };

  const y = trailing(history, m);
  if (y.length < MIN_POINTS) return { ...base, n: y.length };

  const { slope, intercept, r2 } = regress(y);
  const n = y.length;
  const fitEnd = intercept + slope * (n - 1);
  const latest = y[n - 1];
  const fc = { ...base, slope, r2, n, latest };
  if (Math.abs(slope) < meta.minSlope) return { ...fc, status: 'flat' };
  if (slope < 0) return { ...fc, status: 'falling' };
  if (r2 < MIN_R2) return { ...fc, status: 'poor_fit' };

  const crossing = (limit: number) => {
    if (latest >= limit) return 0;
    const k = Math.max(1, Math.ceil((limit - fitEnd) / slope - 1e-9));
    return k <= SEARCH ? k : null;
  };
  return {
    ...fc,
    status: 'ok',
    confidence: r2 >= 0.95 && n >= 10 ? 'high' : r2 >= 0.8 ? 'medium' : 'low',
    toWarn: crossing(fc.warn),
    toCritical: crossing(fc.critical),
    projected: Array.from({ length: HORIZON }, (_, i) => r1(Math.min(meta.cap, fitEnd + slope * (i + 1)))),
  };
}

export type Forecasts = Record<Metric, Forecast | null>;
export const forecastAll = (history: Reading[], missedTicks: number, th: Thresholds): Forecasts => ({
  temp: forecastMetric(history, 'temp', missedTicks, th),
  rh: forecastMetric(history, 'rh', missedTicks, th),
  moisture: forecastMetric(history, 'moisture', missedTicks, th),
});

/** How far off was the projection made `back` readings ago? Honest self-check shown in the UI. */
export function backtest(history: Reading[], m: Metric, back = 5) {
  const y = trailing(history, m);
  if (y.length < MIN_POINTS + back) return null;
  const past = y.slice(0, y.length - back);
  const { slope, intercept } = regress(past);
  const predicted = intercept + slope * (past.length - 1 + back);
  const actual = y[y.length - 1];
  return { back, predicted: r1(predicted), actual, error: r1(predicted - actual) };
}

const eta = (n: number, speed: number) => `~${n} reading${n === 1 ? '' : 's'} (~${Math.round((n * 2.5) / speed)} s at ${speed}×)`;

/** Plain-language outlook line. Never claims safety. */
export function outlookText(f: Forecast, speed = 1): string {
  const u = f.unit;
  switch (f.status) {
    case 'stale': return 'No projection: readings are stale.';
    case 'insufficient': return 'Collecting readings before projecting.';
    case 'flat': return 'Steady. No limit crossing projected.';
    case 'falling': return 'Falling. No limit crossing projected.';
    case 'poor_fit': return 'Trend unclear (noisy readings). No projection.';
    case 'ok': {
      if (f.toWarn === 0) {
        return f.toCritical === 0 ? `At or above the critical limit (${f.critical}${u}).`
          : f.toCritical !== null ? `Above the warning limit. Critical limit (${f.critical}${u}) in ${eta(f.toCritical, speed)}.`
          : 'Above the warning limit. Critical limit not projected soon.';
      }
      if (f.toWarn === null) return 'No limit crossing projected within 60 readings.';
      return `Warning limit (${f.warn}${u}) in ${eta(f.toWarn, speed)}` + (f.toCritical !== null ? `; critical in ${eta(f.toCritical, speed)}.` : '.');
    }
  }
}
