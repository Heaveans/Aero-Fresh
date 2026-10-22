import { Check, CheckCheck } from 'lucide-react';
import { fmtTime } from '../lib/format';
import { RULE_LABELS } from '../lib/risk';
import type { Alert } from '../lib/types';

const SEV = { critical: 'bg-red-700 text-white', warning: 'bg-maize-500 text-charcoal' } as const;

function AlertCard({ a, onAck, onResolve }: { a: Alert; onAck: (id: string) => void; onResolve: (id: string) => void }) {
  return (
    <li className={`rounded-md border bg-white p-3 ${a.severity === 'critical' ? 'border-red-300' : 'border-maize-400'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-sm font-bold ${SEV[a.severity]}`}>{a.severity === 'critical' ? 'Critical' : 'Warning'}</span>
        <h3 className="font-semibold">{RULE_LABELS[a.ruleId]}</h3>
        {a.status === 'acknowledged' && <span className="rounded-full bg-forest-100 px-2 py-0.5 text-xs font-medium text-forest-800">Acknowledged</span>}
      </div>

      <dl className="mt-2 grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
        <div><dt className="inline text-charcoal/60">Storage unit: </dt><dd className="inline">{a.unitName}</dd></div>
        <div><dt className="inline text-charcoal/60">Triggering reading: </dt><dd className="inline">{a.trigger} at {fmtTime(a.triggerAt)}</dd></div>
        <div><dt className="inline text-charcoal/60">Raised: </dt><dd className="inline">{fmtTime(a.raisedAt)}</dd></div>
        <div><dt className="inline text-charcoal/60">Condition seen in: </dt><dd className="inline">{a.occurrences} reading{a.occurrences > 1 ? 's' : ''}</dd></div>
      </dl>

      <p className="mt-2 text-sm"><b>Why: </b>{a.reason}</p>

      <div className="mt-2 text-sm">
        <b>Recommended actions</b>
        <ul className="ml-5 mt-1 list-disc space-y-0.5">
          {a.actions.map((x) => <li key={x}>{x}</li>)}
        </ul>
      </div>

      <div className="mt-3 flex gap-2">
        <button className="btn-ghost" disabled={a.status === 'acknowledged'} onClick={() => onAck(a.id)}><Check size={16} aria-hidden /> Acknowledge</button>
        <button className="btn-primary" onClick={() => onResolve(a.id)}><CheckCheck size={16} aria-hidden /> Resolve</button>
      </div>
    </li>
  );
}

export function AlertsPanel({ alerts, onAck, onResolve }: { alerts: Alert[]; onAck: (id: string) => void; onResolve: (id: string) => void }) {
  const open = alerts
    .filter((a) => a.status !== 'resolved')
    .sort((a, b) => (a.severity === b.severity ? b.raisedAt - a.raisedAt : a.severity === 'critical' ? -1 : 1));
  const resolved = alerts.filter((a) => a.status === 'resolved').reverse().slice(0, 10);

  return (
    <section className="card" aria-labelledby="alerts-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="alerts-h" className="font-display text-lg font-bold text-forest-900">Active alerts ({open.length})</h2>
        <span className="text-xs text-charcoal/60">Thresholds are illustrative and unvalidated.</span>
      </div>

      {open.length === 0 ? (
        <p className="mt-3 rounded-md bg-forest-50 p-3 text-sm">
          No active alerts. Start a scenario to see rules trigger. An empty list only means no demo rule is currently triggered; it does not confirm the maize is safe.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {open.map((a) => <AlertCard key={a.id} a={a} onAck={onAck} onResolve={onResolve} />)}
        </ul>
      )}

      {resolved.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-forest-800">Resolved alerts ({resolved.length})</summary>
          <ul className="mt-2 divide-y divide-forest-100">
            {resolved.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>{RULE_LABELS[a.ruleId]} <span className="text-charcoal/60">({a.severity})</span></span>
                <span className="text-charcoal/60">
                  {a.resolvedBy === 'auto' ? 'Condition cleared' : 'Resolved by user'} at {fmtTime(a.resolvedAt ?? a.raisedAt)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
