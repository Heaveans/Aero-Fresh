import { Bell, Check, CheckCheck, Fan, Info, Shuffle } from 'lucide-react';
import { fmtTime } from '../lib/format';
import type { AppEvent, EventKind } from '../lib/types';

const ICON: Record<EventKind, typeof Bell> = { alert: Bell, ack: Check, resolve: CheckCheck, fan: Fan, scenario: Shuffle, system: Info };

export function EventsPanel({ events }: { events: AppEvent[] }) {
  return (
    <section className="card">
      <h2 className="font-display text-lg font-bold text-forest-900">Recent events and actions</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-charcoal/60">Nothing yet. Events appear here as alerts are raised, acknowledged and resolved, and as fan commands are sent.</p>
      ) : (
        <ul className="mt-2 max-h-80 divide-y divide-forest-100 overflow-y-auto text-sm">
          {events.slice(0, 20).map((e) => {
            const Icon = ICON[e.kind];
            return (
              <li key={e.id} className="flex gap-2 py-2">
                <Icon size={16} className="mt-0.5 shrink-0 text-forest-700" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div>{e.message}</div>
                  {e.action && <div className="text-xs text-charcoal/65">Suggested first step: {e.action}</div>}
                </div>
                <time className="shrink-0 text-xs text-charcoal/60">{fmtTime(e.t)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
