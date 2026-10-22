import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtTime } from '../lib/format';
import type { Forecasts } from '../lib/forecast';
import type { Reading, Thresholds } from '../lib/types';

type Row = { time: string; temp: number | null; rh: number | null; tempProj: number | null; rhProj: number | null };

export function TrendChart({ history, th, forecasts, className = '' }: { history: Reading[]; th: Thresholds; forecasts: Forecasts; className?: string }) {
  const data: Row[] = history.map((r) => ({ time: fmtTime(r.t), temp: r.temp, rh: r.rh, tempProj: null, rhProj: null }));
  const lastIdx = data.length - 1;
  // Append the projected points (dashed). Each projection starts from the latest real reading so the lines connect.
  (['temp', 'rh'] as const).forEach((m) => {
    const f = forecasts[m];
    const key = m === 'temp' ? 'tempProj' : 'rhProj';
    if (!f || f.status !== 'ok' || lastIdx < 0) return;
    data[lastIdx][key] = data[lastIdx][m];
    f.projected.forEach((v, i) => {
      if (!data[lastIdx + 1 + i]) data.push({ time: `+${i + 1}`, temp: null, rh: null, tempProj: null, rhProj: null });
      data[lastIdx + 1 + i][key] = v;
    });
  });
  return (
    <div className={`card ${className}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold text-forest-900">Recent readings</h2>
        <span className="text-xs text-charcoal/60">Last {history.length} of 100 · gaps = sensor offline · dashed = trend projection</span>
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
            <YAxis yAxisId="temp" domain={[15, 45]} tick={{ fontSize: 11 }} unit="°" />
            <YAxis yAxisId="rh" orientation="right" domain={[30, 100]} tick={{ fontSize: 11 }} unit="%" />
            <Tooltip />
            <Legend />
            <ReferenceLine yAxisId="rh" y={th.humidityWarn} stroke="#2F7D4A" strokeDasharray="4 4" />
            <ReferenceLine yAxisId="temp" y={th.tempWarn} stroke="#C99A12" strokeDasharray="4 4" />
            <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temperature (°C)" stroke="#C99A12" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line yAxisId="temp" type="monotone" dataKey="tempProj" name="Temperature projection" stroke="#C99A12" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
            <Line yAxisId="rh" type="monotone" dataKey="rhProj" name="Humidity projection" stroke="#2F7D4A" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls />
            <Line yAxisId="rh" type="monotone" dataKey="rh" name="Ambient humidity (%)" stroke="#2F7D4A" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-charcoal/60">Thin dashed horizontal lines are the illustrative warning thresholds. Projections are straight-line extrapolations, not validated predictions.</p>
    </div>
  );
}
