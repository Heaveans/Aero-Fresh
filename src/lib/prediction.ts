import type { Reading, Thresholds } from './types';

export const PREDICTION_WINDOW = 6;
export const PREDICTION_HORIZON = 20;
const MIN_SAMPLES = 3;

export type ForecastMetric = 'temperature' | 'humidity';
export type ForecastStatus =
  | 'insufficient-data'
  | 'offline'
  | 'at-warning'
  | 'at-critical'
  | 'not-rising'
  | 'projected'
  | 'no-crossing';

export interface MetricForecast {
  metric: ForecastMetric;
  unit: '°C' | '%';
  status: ForecastStatus;
  current: number | null;
  slopePerReading: number | null;
  warningThreshold: number;
  criticalThreshold: number;
  warningInReadings: number | null;
  criticalInReadings: number | null;
  sampleCount: number;
}

export interface Prediction {
  temperature: MetricForecast;
  humidity: MetricForecast;
}

function contiguousValues(history: Reading[], metric: ForecastMetric): { tick: number; value: number }[] {
  const values: { tick: number; value: number }[] = [];
  for (let i = history.length - 1; i >= 0 && values.length < PREDICTION_WINDOW; i--) {
    const reading = history[i];
    const value = metric === 'temperature' ? reading.temp : reading.rh;
    if (reading.offline || value === null || !Number.isFinite(value)) break;
    values.unshift({ tick: reading.tick, value });
  }
  return values;
}

function slopePerReading(values: { tick: number; value: number }[]): number {
  const meanTick = values.reduce((sum, point) => sum + point.tick, 0) / values.length;
  const meanValue = values.reduce((sum, point) => sum + point.value, 0) / values.length;
  const numerator = values.reduce((sum, point) => sum + (point.tick - meanTick) * (point.value - meanValue), 0);
  const denominator = values.reduce((sum, point) => sum + (point.tick - meanTick) ** 2, 0);
  return denominator === 0 ? 0 : numerator / denominator;
}

function makeForecast(
  history: Reading[],
  metric: ForecastMetric,
  warningThreshold: number,
  criticalThreshold: number,
): MetricForecast {
  const values = contiguousValues(history, metric);
  const latest = values.at(-1)?.value ?? null;
  const unit = metric === 'temperature' ? '°C' : '%';
  const base = {
    metric,
    unit,
    current: latest,
    slopePerReading: null,
    warningThreshold,
    criticalThreshold,
    warningInReadings: null,
    criticalInReadings: null,
    sampleCount: values.length,
  } as const;
  const lastReading = history.at(-1);

  if (lastReading?.offline) return { ...base, status: 'offline' };
  if (values.length < MIN_SAMPLES) return { ...base, status: 'insufficient-data' };
  if (latest === null) return { ...base, status: 'insufficient-data' };
  if (latest >= criticalThreshold) return { ...base, status: 'at-critical' };
  if (latest >= warningThreshold) return { ...base, status: 'at-warning' };

  const slope = slopePerReading(values);
  if (slope <= 0) return { ...base, status: 'not-rising', slopePerReading: slope };

  const warningInReadings = (warningThreshold - latest) / slope;
  const criticalInReadings = (criticalThreshold - latest) / slope;
  const inHorizon = warningInReadings <= PREDICTION_HORIZON;
  return {
    ...base,
    status: inHorizon ? 'projected' : 'no-crossing',
    slopePerReading: slope,
    warningInReadings: inHorizon ? warningInReadings : null,
    criticalInReadings: criticalInReadings <= PREDICTION_HORIZON ? criticalInReadings : null,
  };
}

/** A linear extrapolation of recent contiguous readings; not an alert or an AI prediction. */
export function predictTrends(history: Reading[], thresholds: Thresholds): Prediction {
  return {
    temperature: makeForecast(history, 'temperature', thresholds.tempWarn, thresholds.tempCritical),
    humidity: makeForecast(history, 'humidity', thresholds.humidityWarn, thresholds.humidityCritical),
  };
}
