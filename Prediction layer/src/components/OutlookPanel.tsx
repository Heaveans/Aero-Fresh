import { backtest, METRICS, outlookText, type Forecasts } from '../lib/forecast';
import type { Reading, Speed } from '../lib/types';

const SLOPE_DP = { temp: 2, rh: 1, moisture: 2 } as const;

export function OutlookPanel({ forecasts, history, speed }: { forecasts: Forecasts; history: Reading[]; speed: Speed }) {
  return (
    <section className="card">
      <h2 className="font-display text-lg font-bold text-forest-900">Outlook</h2>
      <p className="text-xs text-charcoal/65">
        Straight-line trend projection of recent readings. Not a validated prediction. Display only: it never creates alerts.
      </p>
      <ul className="mt-3 divide-y divide-forest-100 text-sm">
        {METRICS.map((m) => {
          const f = forecasts[m];
          if (!f) {
            return (
              <li key={m} className="py-2">
                <b>Grain moisture</b>
                <div className="text-charcoal/60">Not measured in this scenario, so not projected.</div>
              </li>
            );
          }
          const bt = backtest(history, m, 5);
          return (
            <li key={m} className="py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <b>{f.label}</b>
                <span className="text-xs text-charcoal/65">
                  {f.status === 'ok' ? `rising ${f.slope.toFixed(SLOPE_DP[m])} ${f.unit}/reading · confidence ${f.confidence} (fit ${f.r2.toFixed(2)}, ${f.n} readings)` : f.n > 0 ? `${f.n} readings` : ''}
                </span>
              </div>
              <div>{outlookText(f, speed)}</div>
              {bt && f.status !== 'stale' && (
                <div className="text-xs text-charcoal/60">
                  Self-check: the projection from {bt.back} readings ago was off by {Math.abs(bt.error)} {f.unit} ({bt.error > 0 ? 'too high' : bt.error < 0 ? 'too low' : 'exact'}).
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
