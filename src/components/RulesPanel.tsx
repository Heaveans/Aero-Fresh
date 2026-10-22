import { useState } from 'react';
import { THRESHOLD_FIELDS } from '../lib/risk';
import type { Thresholds } from '../lib/types';

export function RulesPanel({ th, onChange, onDefaults, defaultOpen = false }: { th: Thresholds; onChange: (k: keyof Thresholds, v: number) => void; onDefaults: () => void; defaultOpen?: boolean }) {
  const [version, setVersion] = useState(0); // remounts inputs after "Restore defaults"
  return (
    <section className="card">
      <details open={defaultOpen || undefined}>
        <summary className="cursor-pointer font-display text-lg font-bold text-forest-900">Rule thresholds</summary>
        <p className="mt-2 rounded-md bg-maize-100 p-2 text-sm">
          Set the thresholds AeroFresh uses to evaluate storage conditions and generate alerts. Ambient humidity and grain moisture are assessed independently; one is never used to estimate the other.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {THRESHOLD_FIELDS.map((f) => (
            <label key={`${f.key}-${version}`} className="flex items-center justify-between gap-2 text-sm">
              <span>{f.label}</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step={f.step}
                  defaultValue={th[f.key]}
                  onChange={(e) => {
                    const v = e.target.valueAsNumber;
                    if (Number.isFinite(v)) onChange(f.key, v);
                  }}
                  className="w-20 rounded border border-forest-200 bg-white px-2 py-1 text-right"
                />
                <span className="w-24 text-xs text-charcoal/60">{f.unit}</span>
              </span>
            </label>
          ))}
        </div>
        <button className="btn-ghost mt-3" onClick={() => { onDefaults(); setVersion((v) => v + 1); }}>Restore default thresholds</button>
      </details>
    </section>
  );
}
