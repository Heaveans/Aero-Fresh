/**
 * Condition risk score (0-100): a transparent weighted HEURISTIC, not a trained model and not validated.
 * It only describes how close simulated readings are to the same illustrative thresholds the alerts use.
 * It cannot say anything is safe, and a "Low" band does not mean the maize is free of insects, mould or aflatoxin.
 * Grain moisture contributes only when it was measured; an unmeasured factor is dropped, never counted as zero.
 */
import type { Reading, Thresholds } from './types';

export type Band = 'Low' | 'Elevated' | 'High' | 'Unknown';
export interface ScoreComponent { key: 'humidity' | 'temp' | 'trend' | 'moisture'; label: string; weight: number; value: number | null }
export interface ScoreResult { score: number | null; band: Band; components: ScoreComponent[]; driver: ScoreComponent | null; reason?: string }

export const WEIGHTS = { humidity: 0.35, temp: 0.25, trend: 0.1, moisture: 0.3 };
export const FLOOR_FACTOR = 0.8; // a single high factor cannot be diluted below 80% of its own value
const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** 0 at (warn - (critical - warn)), 50 at warn, 100 at critical. */
export function scale(v: number, warn: number, critical: number) {
  const span = critical - warn || 1;
  return clamp(((v - (warn - span)) / (2 * span)) * 100);
}
export const bandOf = (s: number): Band => (s < 34 ? 'Low' : s < 67 ? 'Elevated' : 'High');

export function computeScore(history: Reading[], missedTicks: number, th: Thresholds): ScoreResult {
  const lv = [...history].reverse().find((r) => !r.offline);
  const empty: ScoreComponent[] = [
    { key: 'humidity', label: 'Ambient humidity', weight: WEIGHTS.humidity, value: null },
    { key: 'temp', label: 'Temperature', weight: WEIGHTS.temp, value: null },
    { key: 'trend', label: 'Temperature trend', weight: WEIGHTS.trend, value: null },
    { key: 'moisture', label: 'Grain moisture', weight: WEIGHTS.moisture, value: null },
  ];
  if (!lv) return { score: null, band: 'Unknown', components: empty, driver: null, reason: 'No readings yet.' };
  if (missedTicks >= th.staleReadings) return { score: null, band: 'Unknown', components: empty, driver: null, reason: 'Stale data: sensor offline.' };

  const tw = Math.max(2, Math.round(th.tempTrendWindow));
  const win = history.slice(-tw);
  const trendRise = win.length === tw && win.every((r) => !r.offline && r.temp !== null) ? (win[tw - 1].temp as number) - (win[0].temp as number) : null;

  const value = {
    humidity: lv.rh === null ? null : scale(lv.rh, th.humidityWarn, th.humidityCritical),
    temp: lv.temp === null ? null : scale(lv.temp, th.tempWarn, th.tempCritical),
    trend: trendRise === null ? null : clamp((Math.max(0, trendRise) / (2 * th.tempTrendRise)) * 100),
    moisture: lv.moisture === null ? null : scale(lv.moisture, th.moistureWarn, th.moistureCritical),
  };
  const components = empty.map((c) => ({ ...c, value: value[c.key] }));
  const avail = components.filter((c) => c.value !== null);
  if (avail.length === 0) return { score: null, band: 'Unknown', components, driver: null, reason: 'No measurable factors.' };

  const wsum = avail.reduce((a, c) => a + c.weight, 0);
  const avg = avail.reduce((a, c) => a + c.weight * (c.value as number), 0) / wsum;
  const top = avail.reduce((a, c) => ((c.value as number) > (a.value as number) ? c : a));
  const score = Math.round(Math.max(avg, FLOOR_FACTOR * (top.value as number)));
  return { score, band: bandOf(score), components, driver: (top.value as number) > 0 ? top : null };
}
