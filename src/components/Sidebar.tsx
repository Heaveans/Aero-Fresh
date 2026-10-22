import { Bell, LayoutDashboard, Settings, Store, TrendingUp, Wheat } from 'lucide-react';

export type PageId = 'dashboard' | 'stores' | 'alerts' | 'trends' | 'settings';

const ITEMS: { id: PageId; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'stores', label: 'Stores and bays', Icon: Store },
  { id: 'alerts', label: 'Alert History', Icon: Bell },
  { id: 'trends', label: 'Trend History and summary', Icon: TrendingUp },
  { id: 'settings', label: 'Settings', Icon: Settings },
];

export function Sidebar({ page, onNavigate }: { page: PageId; onNavigate: (id: PageId) => void }) {
  return (
    <aside className="border-b border-forest-100 bg-white lg:min-h-[calc(100vh-4rem)] lg:border-b-0 lg:border-r">
      <div className="p-3 lg:sticky lg:top-0">
        <div className="mb-2 hidden items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-charcoal/50 lg:flex">
          <Wheat size={15} aria-hidden /> Workspace
        </div>
        <nav aria-label="Main navigation" className="flex gap-1 overflow-x-auto lg:flex-col">
          {ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={page === id ? 'page' : undefined}
              onClick={() => onNavigate(id)}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors lg:w-full ${
                page === id ? 'bg-forest-800 font-semibold text-white' : 'text-forest-900 hover:bg-forest-50'
              }`}
            >
              <Icon size={17} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <p className="mt-4 hidden rounded-md bg-maize-100 p-3 text-xs leading-relaxed text-charcoal/70 lg:block">
          DEMO MODE<br />Simulated readings only. No hardware connected.
        </p>
      </div>
    </aside>
  );
}
