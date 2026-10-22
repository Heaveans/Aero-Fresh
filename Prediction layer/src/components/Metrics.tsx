import type { ReactNode } from 'react';
import { AlertTriangle, Minus, ShieldCheck, Siren, TrendingDown, TrendingUp } from 'lucide-react';
import type { Forecast } from '../lib/forecast';
import type { RiskLevel } from '../lib/types';

const STATUS = {
  normal: { label: 'Normal', cls: 'bg-forest-800 text-white', Icon: ShieldCheck },
  warning: { label: 'Warning', cls: 'bg-maize-500 text-charcoal', Icon: AlertTriangle },
  critical: { label: 'Critical', cls: 'bg-red-700 text-white', Icon: Siren },
} as const;

export function StatusCard({ level, openAlerts }: { level: RiskLevel; openAlerts: number }) {
  const { label, cls, Icon } = STATUS[level];
  return (
    <div className={`rounded-lg p-4 ${cls}`}>
      <div className="text-sm opacity-90">Overall risk status</div>
      <div className="mt-1 flex items-center gap-2 font-display text-4xl font-bold">
        <Icon size={32} aria-hidden /> {label}
      </div>
      <div className="mt-2 text-sm">
        {openAlerts === 0 ? 'No unresolved alerts' : `${openAlerts} unresolved alert${openAlerts > 1 ? 's' : ''}`}
      </div>
      <p className="mt-2 text-xs opacity-90">
        Based only on simulated readings and demo rules. “Normal” does not mean the maize is safe, aflatoxin-free or pest-free.
      </p>
    </div>
  );
}

export function MetricCard(props: {
  icon: ReactNode;
  label: string;
  value: string | null;
  unit: string;
  note: string;
  stale?: boolean;
  forecast?: Forecast | null;
  outlook?: string;
}) {
  const { icon, label, value, unit, note, stale, forecast, outlook } = props;
  const Trend = forecast?.status === 'ok' ? TrendingUp : forecast?.status === 'falling' ? TrendingDown : forecast?.status === 'flat' ? Minus : null;
  return (
    <div className={`card ${stale ? 'border-maize-500 bg-maize-100/40' : ''}`}>
      <div className="flex items-center gap-2 text-sm text-forest-800">
        {icon} {label}
      </div>
      <div className={`mt-2 flex items-center gap-2 font-display text-4xl font-bold ${value === null ? 'text-charcoal/30' : ''} ${stale ? 'text-charcoal/60' : ''}`}>
        <span>
          {value ?? '—'}
          {value !== null && <span className="ml-1 text-lg font-normal text-charcoal/60">{unit}</span>}
        </span>
        {Trend && !stale && <Trend size={22} className="text-forest-700" aria-label={`trend ${forecast?.status}`} />}
      </div>
      <div className={`mt-1 text-xs ${stale ? 'font-semibold text-maize-700' : 'text-charcoal/60'}`}>{note}</div>
      {outlook && <div className="mt-1 text-xs text-forest-800">{outlook}</div>}
    </div>
  );
}
