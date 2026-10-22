import { Fan, Info } from 'lucide-react';
import { fmtTime } from '../lib/format';
import { severityRank } from '../lib/risk';
import type { Alert, FanCommand, ScenarioId } from '../lib/types';

interface Props {
  fanOn: boolean;
  fanMode: 'off' | 'manual' | 'automatic';
  fanUntilAt: number | null;
  alerts: Alert[];
  scenario: ScenarioId;
  interventions: FanCommand[];
  onCommand: (c: 'ON' | 'OFF') => void;
}

export function FanPanel({ fanOn, fanMode, fanUntilAt, alerts, scenario, interventions, onCommand }: Props) {
  const latest = interventions[0];
  const openAlerts = alerts.filter((alert) => alert.status !== 'resolved');
  const highestSeverity = openAlerts.reduce<'warning' | 'critical' | null>(
    (highest, alert) => !highest || severityRank(alert.severity) > severityRank(highest) ? alert.severity : highest,
    null,
  );
  const manualDuration = highestSeverity === 'critical' ? 30 : 10;
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-forest-900">Simulated ventilation fan</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold ${fanOn ? 'bg-forest-800 text-white' : 'bg-charcoal/10 text-charcoal'}`}>
          <Fan size={15} aria-hidden /> {fanOn ? 'ON' : 'OFF'}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn-primary" onClick={() => onCommand('ON')}>Send ON command · {manualDuration}s</button>
        <button className="btn-ghost" onClick={() => onCommand('OFF')}>Send OFF command</button>
      </div>

      <p className="mt-2 text-xs text-charcoal/65">
        Manual runtime is selected from the highest open alert: {highestSeverity === 'critical' ? 'critical = 30 seconds' : highestSeverity === 'warning' ? 'warning = 10 seconds' : 'no active alert = 10 seconds'}.
        Automatic simulated ventilation starts after an eligible temperature or humidity alert remains active for 10 more seconds, then runs until both readings fall below warning thresholds.
      </p>
      {fanMode === 'manual' && fanUntilAt !== null && (
        <p className="mt-2 text-xs font-medium text-forest-800">Manual run ends at {fmtTime(fanUntilAt)}.</p>
      )}
      {fanMode === 'automatic' && (
        <p className="mt-2 text-xs font-medium text-forest-800">Automatic run: waiting for temperature and humidity to return below warning levels.</p>
      )}

      <div role="status" className="mt-3 flex gap-2 rounded-md border border-maize-500 bg-maize-100 p-2.5 text-sm">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        <div>
          {latest ? (
            <>
              {latest.source ? `${latest.source[0].toUpperCase()}${latest.source.slice(1)} ` : ''}command <b>{latest.command}</b>{latest.durationSeconds ? ` for ${latest.durationSeconds}s` : ''} recorded at {fmtTime(latest.t)}. <b>No physical device is connected.</b>
            </>
          ) : (
            <>Commands only change this software state. <b>No physical device is connected.</b></>
          )}
        </div>
      </div>

      <p className="mt-2 text-xs text-charcoal/65">
        {scenario === 'recovery'
          ? 'While ON, the simulated fan moves temperature and ambient humidity toward baseline. It does not dry grain and does not represent real ventilation performance.'
          : 'While ON, the simulated fan temporarily moves temperature and ambient humidity toward baseline, regardless of the selected scenario. It does not change grain moisture.'}
      </p>

      {interventions.length > 0 && (
        <ul className="mt-2 divide-y divide-forest-100 text-sm">
          {interventions.slice(0, 5).map((c) => (
            <li key={c.id} className="flex justify-between py-1">
              <span>Command {c.command}</span>
              <span className="text-charcoal/60">{fmtTime(c.t)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
