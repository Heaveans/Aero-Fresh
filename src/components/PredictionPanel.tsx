import { TrendingUp } from 'lucide-react';
import {
  backtest,
  PREDICTION_HORIZON,
  PREDICTION_SEARCH,
  type MetricForecast,
  predictTrends,
} from '../lib/prediction';
import type { Thresholds, Reading } from '../lib/types';

function describe(forecast: MetricForecast): string {
  switch (forecast.status) {
    case 'offline':
      return 'Unavailable while the latest sensor reading is offline.';
    case 'stale':
      return 'Unavailable: readings are stale.';
    case 'insufficient-data':
      return `Collecting readings: need at least 6 consecutive readings (${forecast.sampleCount} available).`;
    case 'at-critical':
      return `Current reading is at or above the critical threshold (${forecast.criticalThreshold}${forecast.unit}).`;
    case 'at-warning':
      return `Current reading is at or above the warning threshold (${forecast.warningThreshold}${forecast.unit}).`;
    case 'flat':
      return 'Recent readings are steady; no threshold crossing is projected.';
    case 'falling':
      return 'Recent readings are falling; no upward threshold crossing is projected.';
    case 'poor-fit':
      return 'Recent readings are noisy; no projection is shown.';
    case 'no-crossing':
      return `Rising, but no warning-threshold crossing is projected within ${PREDICTION_SEARCH} readings.`;
    case 'projected': {
      const warning = forecast.warningInReadings;
      const critical = forecast.criticalInReadings;
      return `Warning threshold in about ${warning} readings${
        critical === null ? '' : `; critical threshold in about ${critical} readings`
      }.`;
    }
  }
}

function ForecastRow({ forecast, history }: { forecast: MetricForecast; history: Reading[] }) {
  const result = backtest(history, forecast.metric, 5);
  return (
    <div className="rounded-md border border-forest-100 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-forest-900">{forecast.label}</h3>
        <span className="text-sm font-medium">
          {forecast.current === null ? '—' : `${forecast.current.toFixed(1)}${forecast.unit}`}
        </span>
      </div>
      <p className="mt-1 text-xs text-charcoal/70">{describe(forecast)}</p>
      {forecast.slopePerReading !== null && (
        <p className="mt-1 text-xs text-charcoal/60">
          Trend: {forecast.slopePerReading >= 0 ? '+' : ''}
          {forecast.slopePerReading.toFixed(2)} {forecast.unit}/reading
          {forecast.r2 !== null &&
            ` · fit ${forecast.r2.toFixed(2)} · ${forecast.confidence} confidence · ${forecast.sampleCount} readings`}
        </p>
      )}
      {result && forecast.status !== 'stale' && (
        <p className="mt-1 text-xs text-charcoal/60">
          Self-check: projection from {result.back} readings ago was off by {Math.abs(result.error)} {forecast.unit}
          {result.error > 0 ? ' (too high).' : result.error < 0 ? ' (too low).' : ' (exact).'}
        </p>
      )}
    </div>
  );
}

export function PredictionPanel({
  history,
  thresholds,
  missedTicks = 0,
  className = '',
}: {
  history: Reading[];
  thresholds: Thresholds;
  missedTicks?: number;
  className?: string;
}) {
  const prediction = predictTrends(history, thresholds, missedTicks);
  const forecasts: Array<MetricForecast | null> = [
    prediction.temperature,
    prediction.humidity,
    prediction.moisture,
  ];
  return (
    <section className={`card ${className}`} aria-labelledby="prediction-heading">
      <div className="flex items-center gap-2">
        <TrendingUp size={18} className="text-forest-700" aria-hidden />
        <h2 id="prediction-heading" className="font-display text-lg font-bold text-forest-900">
          Short-term trend outlook
        </h2>
      </div>
      <p className="mt-1 text-xs text-charcoal/65">
        Straight-line estimates from up to 12 recent readings; estimates are only shown when the trend fit is usable.
        Projections extend {PREDICTION_HORIZON} readings on the chart.
      </p>
      <div className="mt-3 grid gap-2">
        {forecasts.map((forecast, index) =>
          forecast ? (
            <ForecastRow key={forecast.metric} forecast={forecast} history={history} />
          ) : (
            <div key={`unmeasured-${index}`} className="rounded-md border border-forest-100 bg-white p-3">
              <h3 className="font-semibold text-forest-900">Grain moisture</h3>
              <p className="mt-1 text-xs text-charcoal/70">
                Not measured in this scenario, so no projection is available.
              </p>
            </div>
          ),
        )}
      </div>
      <p className="mt-2 text-xs text-charcoal/60">
        Illustrative only—not an alert, validated risk forecast, or AI model. Thresholds are editable demo settings.
      </p>
    </section>
  );
}
