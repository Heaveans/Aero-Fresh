import { Download } from 'lucide-react';
import { fmtTime } from '../lib/format';
import type { Reading } from '../lib/types';

function stats(readings: Reading[], metric: 'temp' | 'rh') {
  const values = readings.flatMap((reading) => {
    const value = reading[metric];
    return value === null || !Number.isFinite(value) ? [] : [value];
  });
  if (values.length === 0) return null;
  return {
    latest: values[values.length - 1],
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

function MetricSummary({ label, unit, value, samples }: { label: string; unit: string; value: ReturnType<typeof stats>; samples: number }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-forest-900">{label}</h3>
      {!value ? (
        <p className="mt-2 text-sm text-charcoal/60">No valid readings yet.</p>
      ) : (
        <>
          <div className="mt-2 font-display text-3xl font-bold">{value.latest.toFixed(1)}<span className="ml-1 text-base font-normal text-charcoal/60">{unit}</span></div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div><dt className="text-charcoal/60">Average</dt><dd className="font-medium">{value.average.toFixed(1)}{unit}</dd></div>
            <div><dt className="text-charcoal/60">Minimum</dt><dd className="font-medium">{value.minimum.toFixed(1)}{unit}</dd></div>
            <div><dt className="text-charcoal/60">Maximum</dt><dd className="font-medium">{value.maximum.toFixed(1)}{unit}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-charcoal/55">Based on {samples} valid readings in the retained history.</p>
        </>
      )}
    </div>
  );
}

function exportReadings(history: Reading[]) {
  const escape = (value: string | number | boolean | null) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['Timestamp', 'Tick', 'Storage unit', 'Temperature (C)', 'Ambient humidity (%)', 'Grain moisture (%)', 'Offline'],
    ...history.map((reading) => [
      new Date(reading.t).toISOString(),
      reading.tick,
      reading.unitId,
      reading.temp,
      reading.rh,
      reading.moisture,
      reading.offline,
    ]),
  ];
  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'aerofresh-trend-history.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function TrendSummary({ history }: { history: Reading[] }) {
  const validReadings = history.filter((reading) => !reading.offline);
  const temperature = stats(validReadings, 'temp');
  const humidity = stats(validReadings, 'rh');
  const firstTime = history[0]?.t;
  const lastTime = history.at(-1)?.t;
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-forest-900">Trend summary</h2>
          <p className="text-sm text-charcoal/65">
            {history.length} retained readings{firstTime && lastTime ? ` · ${fmtTime(firstTime)}–${fmtTime(lastTime)}` : ''}
          </p>
        </div>
        <button className="btn-ghost" disabled={history.length === 0} onClick={() => exportReadings(history)}>
          <Download size={16} aria-hidden /> Export readings CSV
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricSummary label="Temperature" unit="°C" value={temperature} samples={validReadings.filter((reading) => reading.temp !== null).length} />
        <MetricSummary label="Ambient humidity" unit="%" value={humidity} samples={validReadings.filter((reading) => reading.rh !== null).length} />
      </div>
      <p className="text-xs text-charcoal/60">Summary covers the latest 100 retained simulator readings. Gaps are excluded from averages; these statistics are descriptive and not agronomic guidance.</p>
    </section>
  );
}
