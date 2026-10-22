import type { Band, ScoreResult } from '../lib/score';

const BAND: Record<Band, { bar: string; text: string }> = {
  Low: { bar: 'bg-forest-600', text: 'text-forest-800' },
  Elevated: { bar: 'bg-maize-500', text: 'text-maize-700' },
  High: { bar: 'bg-red-700', text: 'text-red-700' },
  Unknown: { bar: 'bg-charcoal/30', text: 'text-charcoal/60' },
};

export function ScoreCard({ result }: { result: ScoreResult }) {
  const { score, band, components, driver, reason } = result;
  const c = BAND[band];
  return (
    <section className="card">
      <h2 className="font-display text-lg font-bold text-forest-900">Condition risk score</h2>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`font-display text-5xl font-bold ${c.text}`}>{score ?? '—'}</span>
        <span className="text-sm text-charcoal/60">/ 100</span>
        <span className={`ml-auto text-lg font-semibold ${c.text}`}>{band === 'Unknown' ? 'Unknown' : band}</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-forest-50" role="img" aria-label={`Risk score ${score ?? 'unknown'} out of 100`}>
        <div className={`h-full ${c.bar}`} style={{ width: `${score ?? 0}%` }} />
      </div>
      <p className="mt-2 text-sm">
        {reason ?? (driver ? `Main driver: ${driver.label.toLowerCase()}.` : 'No factor is near its illustrative limit.')}
      </p>

      <ul className="mt-3 grid gap-1.5 text-sm">
        {components.map((f) => (
          <li key={f.key} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2">
            <span className="truncate">{f.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-forest-50">
              <span className="block h-full bg-forest-600" style={{ width: `${f.value ?? 0}%` }} />
            </span>
            <span className="text-right text-xs text-charcoal/70">{f.value === null ? 'n/a' : Math.round(f.value)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-charcoal/65">
        Heuristic, unvalidated, not a trained model. It measures closeness to the demo thresholds and is separate from alert status. “Low” does not mean the maize is safe, aflatoxin-free or pest-free. Unmeasured factors are left out, not counted as zero.
      </p>
    </section>
  );
}
