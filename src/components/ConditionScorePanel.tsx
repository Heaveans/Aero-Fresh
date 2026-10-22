import type { ConditionBand, ConditionScore } from '../lib/score';

const BAND_STYLES: Record<ConditionBand, { bar: string; text: string }> = {
  Low: { bar: 'bg-forest-600', text: 'text-forest-800' },
  Elevated: { bar: 'bg-maize-500', text: 'text-maize-700' },
  High: { bar: 'bg-red-700', text: 'text-red-700' },
  Unknown: { bar: 'bg-charcoal/30', text: 'text-charcoal/60' },
};

export function ConditionScorePanel({ result }: { result: ConditionScore }) {
  const style = BAND_STYLES[result.band];
  return (
    <section className="card">
      <h2 className="font-display text-lg font-bold text-forest-900">Condition risk score</h2>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`font-display text-5xl font-bold ${style.text}`}>{result.score ?? '—'}</span>
        <span className="text-sm text-charcoal/60">/ 100</span>
        <span className={`ml-auto text-lg font-semibold ${style.text}`}>{result.band}</span>
      </div>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-forest-50"
        role="img"
        aria-label={`Condition risk score ${result.score ?? 'unknown'} out of 100`}
      >
        <div className={`h-full ${style.bar}`} style={{ width: `${result.score ?? 0}%` }} />
      </div>
      <p className="mt-2 text-sm">
        {result.reason ??
          (result.mainDriver
            ? `Main driver: ${result.mainDriver.label.toLowerCase()}.`
            : 'No factor is near its illustrative limit.')}
      </p>
      <ul className="mt-3 grid gap-1.5 text-sm">
        {result.factors.map((factor) => (
          <li key={factor.key} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2">
            <span className="truncate">{factor.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-forest-50">
              <span className="block h-full bg-forest-600" style={{ width: `${factor.value ?? 0}%` }} />
            </span>
            <span className="text-right text-xs text-charcoal/70">
              {factor.value === null ? 'n/a' : Math.round(factor.value)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-charcoal/65">
        Heuristic only—not validated or a trained model. It measures proximity to demo thresholds, not food safety.
        Unmeasured factors are excluded; Low does not mean maize is safe or free of mould, insects, or aflatoxin.
      </p>
    </section>
  );
}
