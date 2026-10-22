import type { Reading, Thresholds } from './types';

export type ConditionBand = 'Low' | 'Elevated' | 'High' | 'Unknown';
export type ScoreFactorKey = 'humidity' | 'temperature' | 'trend' | 'moisture';

export interface ScoreFactor {
  key: ScoreFactorKey;
  label: string;
  weight: number;
  value: number | null;
}

export interface ConditionScore {
  score: number | null;
  band: ConditionBand;
  factors: ScoreFactor[];
  mainDriver: ScoreFactor | null;
  reason?: string;
}

export const SCORE_WEIGHTS = {
  humidity: 0.35,
  temperature: 0.25,
  trend: 0.1,
  moisture: 0.3,
} as const;

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/** Maps a reading to 0 below warning, 50 at warning and 100 at critical. */
export function scaleToThresholds(value: number, warning: number, critical: number) {
  const span = critical - warning || 1;
  return clamp(((value - (warning - span)) / (2 * span)) * 100);
}

export function conditionBand(score: number): ConditionBand {
  return score < 34 ? 'Low' : score < 67 ? 'Elevated' : 'High';
}

export function computeConditionScore(history: Reading[], missedTicks: number, thresholds: Thresholds): ConditionScore {
  const emptyFactors: ScoreFactor[] = [
    { key: 'humidity', label: 'Ambient humidity', weight: SCORE_WEIGHTS.humidity, value: null },
    { key: 'temperature', label: 'Temperature', weight: SCORE_WEIGHTS.temperature, value: null },
    { key: 'trend', label: 'Temperature trend', weight: SCORE_WEIGHTS.trend, value: null },
    { key: 'moisture', label: 'Grain moisture', weight: SCORE_WEIGHTS.moisture, value: null },
  ];
  const unknown = (reason: string): ConditionScore => ({
    score: null,
    band: 'Unknown',
    factors: emptyFactors,
    mainDriver: null,
    reason,
  });

  if (missedTicks >= thresholds.staleReadings) return unknown('Stale data: sensor offline.');
  const latest = [...history].reverse().find((reading) => !reading.offline);
  if (!latest) return unknown('No readings yet.');

  const trendWindow = Math.max(2, Math.round(thresholds.tempTrendWindow));
  const recent = history.slice(-trendWindow);
  const temperatureRise =
    recent.length === trendWindow && recent.every((reading) => !reading.offline && reading.temp !== null)
      ? recent[recent.length - 1].temp! - recent[0].temp!
      : null;

  const values: Record<ScoreFactorKey, number | null> = {
    humidity: latest.rh === null ? null : scaleToThresholds(latest.rh, thresholds.humidityWarn, thresholds.humidityCritical),
    temperature: latest.temp === null ? null : scaleToThresholds(latest.temp, thresholds.tempWarn, thresholds.tempCritical),
    trend:
      temperatureRise === null
        ? null
        : clamp((Math.max(0, temperatureRise) / (2 * thresholds.tempTrendRise)) * 100),
    moisture:
      latest.moisture === null
        ? null
        : scaleToThresholds(latest.moisture, thresholds.moistureWarn, thresholds.moistureCritical),
  };
  const factors = emptyFactors.map((factor) => ({ ...factor, value: values[factor.key] }));
  const available = factors.filter((factor) => factor.value !== null);
  if (available.length === 0) return unknown('No measurable factors.');

  const totalWeight = available.reduce((sum, factor) => sum + factor.weight, 0);
  const weightedAverage =
    available.reduce((sum, factor) => sum + factor.weight * factor.value!, 0) / totalWeight;
  const mainDriver = available.reduce((top, factor) => (factor.value! > top.value! ? factor : top));
  const score = Math.round(Math.max(weightedAverage, 0.8 * mainDriver.value!));
  return {
    score,
    band: conditionBand(score),
    factors,
    mainDriver: mainDriver.value! > 0 ? mainDriver : null,
  };
}
