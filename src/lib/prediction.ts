import type { Reading, Thresholds } from './types';

export const PREDICTION_WINDOW = 12;
export const MIN_PREDICTION_SAMPLES = 6;
export const PREDICTION_HORIZON = 10;
export const PREDICTION_SEARCH = 60;
export const MIN_PREDICTION_R2 = 0.6;

export type ForecastMetric = 'temperature' | 'humidity' | 'moisture';
export type ForecastStatus =
  | 'insufficient-data'
  | 'offline'
  | 'stale'
  | 'at-warning'
  | 'at-critical'
  | 'flat'
  | 'falling'
  | 'poor-fit'
  | 'projected'
  | 'no-crossing';
export type ForecastConfidence = 'low' | 'medium' | 'high';

export interface MetricForecast {
  metric: ForecastMetric;
  label: string;
  unit: '°C' | '%';
  status: ForecastStatus;
  current: number | null;
  slopePerReading: number | null;
  r2: number | null;
  confidence: ForecastConfidence;
  warningThreshold: number;
  criticalThreshold: number;
  warningInReadings: number | null;
  criticalInReadings: number | null;
  sampleCount: number;
  projected: number[];
}

export interface Prediction {
  temperature: MetricForecast;
  humidity: MetricForecast;
  moisture: MetricForecast | null;
}

const MIN_SLOPE: Record<ForecastMetric, number> = {
  temperature: 0.05,
  humidity: 0.2,
  moisture: 0.02,
};

const CAP: Record<ForecastMetric, number> = {
  temperature: 45,
  humidity: 100,
  moisture: 25,
};

function readingValue(reading: Reading, metric: ForecastMetric): number | null {
  if (metric === 'temperature') return reading.temp;
  if (metric === 'humidity') return reading.rh;
  return reading.moisture;
}

function trailingValues(history: Reading[], metric: ForecastMetric): number[] {
  const values: number[] = [];
  for (let i = history.length - 1; i >= 0 && values.length < PREDICTION_WINDOW; i--) {
    const reading = history[i];
    const value = readingValue(reading, metric);
    if (reading.offline || value === null || !Number.isFinite(value)) break;
    values.unshift(value);
  }
  return values;
}

export function regress(values: number[]) {
  const count = values.length;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  values.forEach((value, index) => {
    xx += (index - meanX) ** 2;
    xy += (index - meanX) * (value - meanY);
    yy += (value - meanY) ** 2;
  });
  const slope = xx === 0 ? 0 : xy / xx;
  const intercept = meanY - slope * meanX;
  const residual = values.reduce((sum, value, index) => sum + (value - (intercept + slope * index)) ** 2, 0);
  return { slope, intercept, r2: yy === 0 ? 1 : 1 - residual / yy };
}

function thresholdsFor(metric: ForecastMetric, thresholds: Thresholds) {
  if (metric === 'temperature') return { warning: thresholds.tempWarn, critical: thresholds.tempCritical };
  if (metric === 'humidity') return { warning: thresholds.humidityWarn, critical: thresholds.humidityCritical };
  return { warning: thresholds.moistureWarn, critical: thresholds.moistureCritical };
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function forecastMetric(
  history: Reading[],
  metric: ForecastMetric,
  thresholds: Thresholds,
  missedTicks: number,
): MetricForecast | null {
  const label = metric === 'temperature' ? 'Temperature' : metric === 'humidity' ? 'Ambient humidity' : 'Grain moisture';
  const unit = metric === 'temperature' ? '°C' : '%';
  const limits = thresholdsFor(metric, thresholds);
  const latestReading = [...history].reverse().find((reading) => !reading.offline);
  if (metric === 'moisture' && (!latestReading || latestReading.moisture === null)) return null;

  const values = trailingValues(history, metric);
  const current = values.at(-1) ?? null;
  const base: MetricForecast = {
    metric,
    label,
    unit,
    status: 'insufficient-data',
    current,
    slopePerReading: null,
    r2: null,
    confidence: 'low',
    warningThreshold: limits.warning,
    criticalThreshold: limits.critical,
    warningInReadings: null,
    criticalInReadings: null,
    sampleCount: values.length,
    projected: [],
  };

  if (missedTicks >= thresholds.staleReadings) return { ...base, status: 'stale' };
  if (history.at(-1)?.offline) return { ...base, status: 'offline' };
  if (current !== null && current >= limits.critical) return { ...base, status: 'at-critical' };
  if (current !== null && current >= limits.warning) return { ...base, status: 'at-warning' };
  if (values.length < MIN_PREDICTION_SAMPLES) return base;

  const { slope, intercept, r2 } = regress(values);
  const fitEnd = intercept + slope * (values.length - 1);
  const fit = { ...base, slopePerReading: slope, r2 };
  if (Math.abs(slope) < MIN_SLOPE[metric]) return { ...fit, status: 'flat' };
  if (slope < 0) return { ...fit, status: 'falling' };
  if (r2 < MIN_PREDICTION_R2) return { ...fit, status: 'poor-fit' };

  const crossing = (limit: number) => {
    const readings = Math.max(1, Math.ceil((limit - fitEnd) / slope - 1e-9));
    return readings <= PREDICTION_SEARCH ? readings : null;
  };
  const warningInReadings = crossing(limits.warning);
  const criticalInReadings = crossing(limits.critical);
  return {
    ...fit,
    status: warningInReadings === null ? 'no-crossing' : 'projected',
    confidence: r2 >= 0.95 && values.length >= 10 ? 'high' : r2 >= 0.8 ? 'medium' : 'low',
    warningInReadings,
    criticalInReadings,
    projected: Array.from(
      { length: PREDICTION_HORIZON },
      (_, index) => round1(Math.min(CAP[metric], fitEnd + slope * (index + 1))),
    ),
  };
}

/** Linear extrapolations of recent contiguous readings; not alerts or validated predictions. */
export function predictTrends(history: Reading[], thresholds: Thresholds, missedTicks = 0): Prediction {
  return {
    temperature: forecastMetric(history, 'temperature', thresholds, missedTicks)!,
    humidity: forecastMetric(history, 'humidity', thresholds, missedTicks)!,
    moisture: forecastMetric(history, 'moisture', thresholds, missedTicks),
  };
}

/** Compare a projection made `back` readings ago with the latest observed value. */
export function backtest(history: Reading[], metric: ForecastMetric, back = 5) {
  const values = trailingValues(history, metric);
  if (values.length < MIN_PREDICTION_SAMPLES + back) return null;
  const past = values.slice(0, values.length - back);
  if (past.length < 2) return null;
  const { slope, intercept } = regress(past);
  const predicted = intercept + slope * (past.length - 1 + back);
  const actual = values.at(-1)!;
  return { back, predicted: round1(predicted), actual, error: round1(predicted - actual) };
}
