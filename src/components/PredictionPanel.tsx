import { TrendingUp } from 'lucide-react';
import { PREDICTION_HORIZON, type MetricForecast } from '../lib/prediction';
import type { Thresholds, Reading } from '../lib/types';
import { predictTrends } from '../lib/prediction';

const describe = (forecast: MetricForecast) => {
  switch (forecast.status) {
    case 'offline':
      return 'Unavailable while the sensor is offline.';
    case 'insufficient-data':
      return `Need at least 3 consecutive readings (${forecast.sampleCount} available).`;
    case 'at-critical':
      return `Current reading is at or above the critical threshold (${forecast.criticalThreshold}${forecast.unit}).`;
    case 'at-warning':
      return `Current reading is at or above the warning threshold (${forecast.warningThreshold}${forecast.unit}).`;
    case 'not-rising':
      return 'Recent trend is stable or falling; no upward crossing projected.';
    case 'no-crossing':
      return `Rising, but no warning-threshold crossing projected within ${PREDICTION_HORIZON} readings.`;
    case 'projected': {
      const warningIn = Math.ceil(forecast.warningInReadings!);
      const critical = forecast.criticalInReadings;
      return `Warning level in about ${warningIn} readings${critical === null ? '' : `; critical level in about ${Math.ceil(critical)} readings`}.`;
    }
  }
};

function ForecastRow({ forecast }: { forecast: MetricForecast }) {
  const label = forecast.metric === 'temperature' ? 'Temperature' : 'Ambient humidity';
  return (
    <div className="rounded-md border border-forest-100 bg-white p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-forest-900">{label}</h3>
        <span className="text-sm font-medium">
          {forecast.current === null ? '—' : `${forecast.current.toFixed(1)}${forecast.unit}`}
        </span>
      </div>
      <p className="mt-1 text-xs text-charcoal/70">{describe(forecast)}</p>
      {forecast.slopePerReading !== null && (
        <p className="mt-1 text-xs text-charcoal/60">
          Trend: {forecast.slopePerReading >= 0 ? '+' : ''}{forecast.slopePerReading.toFixed(2)} {forecast.unit}/reading
        </p>
      )}
    </div>
  );
}

export function PredictionPanel({ history, thresholds }: { history: Reading[]; thresholds: Thresholds }) {
  const prediction = predictTrends(history, thresholds);
  return (
    <section className="card" aria-labelledby="prediction-heading">
      <div className="flex items-center gap-2">
        <TrendingUp size={18} className="text-forest-700" aria-hidden />
        <h2 id="prediction-heading" className="font-display text-lg font-bold text-forest-900">Short-term trend outlook</h2>
      </div>
      <p className="mt-1 text-xs text-charcoal/65">
        Linear estimates from up to 6 recent readings; warning-level estimates are limited to the next {PREDICTION_HORIZON} readings.
      </p>
      <div className="mt-3 grid gap-2">
        <ForecastRow forecast={prediction.temperature} />
        <ForecastRow forecast={prediction.humidity} />
      </div>
      <p className="mt-2 text-xs text-charcoal/60">
        Illustrative only—not an alert, validated risk forecast, or AI model. Thresholds are demo settings.
      </p>
    </section>
  );
}
