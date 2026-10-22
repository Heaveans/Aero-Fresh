import { useState } from 'react';
import { Download } from 'lucide-react';
import { fmtTime } from '../lib/format';
import { EXPORT_PERIOD_OPTIONS, filterByPeriod, type ExportPeriod } from '../lib/exportPeriod';
import { RULE_LABELS } from '../lib/risk';
import type { Alert } from '../lib/types';

function csvCell(value: string | number | undefined) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportAlerts(alerts: Alert[], period: ExportPeriod) {
  const columns = ['Raised at', 'Storage unit', 'Rule', 'Severity', 'Status', 'Trigger', 'Reason', 'Occurrences', 'Resolved at', 'Resolution'];
  const rows = alerts.map((alert) => [
    new Date(alert.raisedAt).toISOString(),
    alert.unitName,
    RULE_LABELS[alert.ruleId],
    alert.severity,
    alert.status,
    alert.trigger,
    alert.reason,
    alert.occurrences,
    alert.resolvedAt ? new Date(alert.resolvedAt).toISOString() : '',
    alert.resolvedBy ?? '',
  ]);
  const csv = [columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `aerofresh-alert-history-${period}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function AlertHistoryPanel({ alerts }: { alerts: Alert[] }) {
  const [exportPeriod, setExportPeriod] = useState<ExportPeriod>('week');
  const sorted = [...alerts].sort((a, b) => b.raisedAt - a.raisedAt);
  const exportAlertsInPeriod = filterByPeriod(sorted, (alert) => alert.raisedAt, exportPeriod);
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-forest-900">Alert history</h2>
          <p className="text-sm text-charcoal/65">All recorded alerts, including acknowledged and resolved items.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="alerts-export-period">Alert export period</label>
          <select
            id="alerts-export-period"
            className="rounded border border-forest-200 bg-white px-2 py-2 text-sm"
            value={exportPeriod}
            onChange={(event) => setExportPeriod(event.target.value as ExportPeriod)}
          >
            {EXPORT_PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button className="btn-ghost" disabled={exportAlertsInPeriod.length === 0} onClick={() => exportAlerts(exportAlertsInPeriod, exportPeriod)}>
            <Download size={16} aria-hidden /> Export CSV ({exportAlertsInPeriod.length})
          </button>
        </div>
      </div>
      {sorted.length === 0 ? (
        <p className="mt-4 rounded-md bg-forest-50 p-3 text-sm">No alert history yet. Alerts will be listed here when demo rules trigger.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-forest-100 text-xs uppercase text-charcoal/60">
                <th className="px-3 py-2 font-medium">Raised</th>
                <th className="px-3 py-2 font-medium">Rule / unit</th>
                <th className="px-3 py-2 font-medium">Severity</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Trigger</th>
                <th className="px-3 py-2 font-medium">Resolved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-forest-100">
              {sorted.map((alert) => (
                <tr key={alert.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-3">{fmtTime(alert.raisedAt)}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold">{RULE_LABELS[alert.ruleId]}</div>
                    <div className="text-xs text-charcoal/60">{alert.unitName}</div>
                  </td>
                  <td className="px-3 py-3 capitalize">{alert.severity}</td>
                  <td className="px-3 py-3 capitalize">{alert.status}</td>
                  <td className="px-3 py-3">{alert.trigger}</td>
                  <td className="whitespace-nowrap px-3 py-3">{alert.resolvedAt ? fmtTime(alert.resolvedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
