import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtTime } from '../lib/format';
import { predictTrends } from '../lib/prediction';
import type { Reading, Thresholds } from '../lib/types';

type ChartRow = {
  time: string;
  temp: number | null;
  rh: number | null;
  tempProjection: number | null;
  rhProjection: number | null;
};

export function TrendChart({
  history,
  th,
  missedTicks = 0,
  className = '',
}: {
  history: Reading[];
  th: Thresholds;
  missedTicks?: number;
  className?: string;
}) {
  const data: ChartRow[] = history.map((reading) => ({
    time: fmtTime(reading.t),
    temp: reading.temp,
    rh: reading.rh,
    tempProjection: null,
    rhProjection: null,
  }));
  const prediction = predictTrends(history, th, missedTicks);
  const lastIndex = data.length - 1;

  const appendProjection = (
    metric: 'temperature' | 'humidity',
    key: 'tempProjection' | 'rhProjection',
    currentValue: number | null,
  ) => {
    const forecast = prediction[metric];
    if (!forecast.projected.length || lastIndex < 0 || currentValue === null) return;
    data[lastIndex][key] = currentValue;
    forecast.projected.forEach((value, index) => {
      const rowIndex = lastIndex + index + 1;
      if (!data[rowIndex]) {
        data.push({
          time: `+${index + 1}`,
          temp: null,
          rh: null,
          tempProjection: null,
          rhProjection: null,
        });
      }
      data[rowIndex][key] = value;
    });
  };

  appendProjection('temperature', 'tempProjection', prediction.temperature.current);
  appendProjection('humidity', 'rhProjection', prediction.humidity.current);
  return (
    <div className={`card ${className}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold text-forest-900">Recent readings</h2>
        <span className="text-xs text-charcoal/60">Last {history.length} of 100 · gaps = offline · dashed = projection</span>
      </div>
      <div className="relative h-72">
        {data.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-charcoal/60">
            No readings yet. Press Start in the simulator.
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#D6E8DB" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis yAxisId="temp" domain={[8, 45]} tick={{ fontSize: 11 }} unit="°" />
            <YAxis yAxisId="rh" orientation="right" domain={[30, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip />
            <Legend />
            <ReferenceLine yAxisId="rh" y={th.humidityWarn} stroke="#2F7D4A" strokeDasharray="4 4" />
            <ReferenceLine yAxisId="temp" y={th.tempWarn} stroke="#C99A12" strokeDasharray="4 4" />
            <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temperature (°C)" stroke="#C99A12" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line yAxisId="temp" type="monotone" dataKey="tempProjection" name="Temperature projection" stroke="#C99A12" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
            <Line yAxisId="rh" type="monotone" dataKey="rh" name="Ambient humidity (%)" stroke="#2F7D4A" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line yAxisId="rh" type="monotone" dataKey="rhProjection" name="Humidity projection" stroke="#2F7D4A" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-charcoal/60">Thin horizontal dashes show illustrative warning thresholds; colored dashes show heuristic projections.</p>
    </div>
  );
}
