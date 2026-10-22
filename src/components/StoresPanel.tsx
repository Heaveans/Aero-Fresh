import { useState, type FormEvent } from 'react';
import { Plus, Warehouse } from 'lucide-react';
import type { StorageStore } from '../lib/types';

interface Props {
  stores: StorageStore[];
  monitoredUnitId: string;
  temperature: number | null;
  humidity: number | null;
  openAlerts: number;
  stale: boolean;
  onAddStore: (name: string) => void;
  onAddBay: (storeId: string, name: string) => void;
  onOpenDashboard: () => void;
}

export function StoresPanel({
  stores,
  monitoredUnitId,
  temperature,
  humidity,
  openAlerts,
  stale,
  onAddStore,
  onAddBay,
  onOpenDashboard,
}: Props) {
  const [storeName, setStoreName] = useState('');
  const [addingStore, setAddingStore] = useState(false);
  const [bayNames, setBayNames] = useState<Record<string, string>>({});
  const [addingBay, setAddingBay] = useState<string | null>(null);

  const submitStore = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = storeName.trim();
    if (!name) return;
    onAddStore(name);
    setStoreName('');
    setAddingStore(false);
  };

  const submitBay = (event: FormEvent<HTMLFormElement>, storeId: string) => {
    event.preventDefault();
    const name = (bayNames[storeId] ?? '').trim();
    if (!name) return;
    onAddBay(storeId, name);
    setBayNames((values) => ({ ...values, [storeId]: '' }));
    setAddingBay(null);
  };

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-charcoal/65">Manage storage locations and add bays under each store.</p>
          <p className="mt-1 text-xs text-charcoal/55">Locations are saved in this browser. Only the original demo bay has simulated readings.</p>
        </div>
        <button className="btn-primary" onClick={() => setAddingStore((open) => !open)}>
          <Plus size={16} aria-hidden /> Add store
        </button>
      </div>

      {addingStore && (
        <form onSubmit={submitStore} className="card flex flex-wrap items-end gap-3">
          <label className="grid min-w-56 flex-1 gap-1 text-sm font-medium text-forest-900">
            Store name
            <input
              autoFocus
              required
              maxLength={80}
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              placeholder="e.g. North warehouse"
              className="rounded-md border border-forest-200 px-3 py-2 font-normal"
            />
          </label>
          <button type="submit" className="btn-primary">Save store</button>
          <button type="button" className="btn-ghost" onClick={() => setAddingStore(false)}>Cancel</button>
        </form>
      )}

      {stores.length === 0 && (
        <div className="card text-sm text-charcoal/65">No stores yet. Add a store to get started.</div>
      )}

      {stores.map((store) => (
        <article key={store.id} className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Warehouse className="mt-1 text-forest-700" size={20} aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-forest-700">Store</p>
                <h2 className="font-display text-xl font-bold text-forest-900">{store.name}</h2>
                <p className="text-xs text-charcoal/55">Store ID: {store.id}</p>
              </div>
            </div>
            <button className="btn-ghost" onClick={() => setAddingBay((current) => current === store.id ? null : store.id)}>
              <Plus size={16} aria-hidden /> Add bay
            </button>
          </div>

          {addingBay === store.id && (
            <form onSubmit={(event) => submitBay(event, store.id)} className="mt-4 flex flex-wrap items-end gap-3 rounded-md bg-forest-50 p-3">
              <label className="grid min-w-48 flex-1 gap-1 text-sm font-medium text-forest-900">
                Bay name
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={bayNames[store.id] ?? ''}
                  onChange={(event) => setBayNames((values) => ({ ...values, [store.id]: event.target.value }))}
                  placeholder="e.g. Bay 2"
                  className="rounded-md border border-forest-200 bg-white px-3 py-2 font-normal"
                />
              </label>
              <button type="submit" className="btn-primary">Save bay</button>
              <button type="button" className="btn-ghost" onClick={() => setAddingBay(null)}>Cancel</button>
            </form>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {store.bays.map((bay) => {
              const monitored = bay.unitId === monitoredUnitId;
              return (
                <div key={bay.id} className="rounded-md border border-forest-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-forest-900">{bay.name}</h3>
                      <p className="text-xs text-charcoal/55">{monitored ? `Monitoring unit ${bay.unitId}` : 'No simulator or sensor assigned'}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${monitored && !stale ? 'bg-forest-100 text-forest-900' : 'bg-charcoal/10 text-charcoal/70'}`}>
                      {monitored ? stale ? 'Stale readings' : 'Simulated' : 'Not connected'}
                    </span>
                  </div>
                  {monitored && (
                    <>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                        <div><dt className="text-xs text-charcoal/60">Temperature</dt><dd className="font-semibold">{temperature === null ? '—' : `${temperature.toFixed(1)} °C`}</dd></div>
                        <div><dt className="text-xs text-charcoal/60">Ambient RH</dt><dd className="font-semibold">{humidity === null ? '—' : `${humidity.toFixed(1)}%`}</dd></div>
                        <div><dt className="text-xs text-charcoal/60">Open alerts</dt><dd className="font-semibold">{openAlerts}</dd></div>
                      </dl>
                      <button className="btn-ghost mt-3" onClick={onOpenDashboard}>Open dashboard</button>
                    </>
                  )}
                </div>
              );
            })}
            {store.bays.length === 0 && (
              <p className="rounded-md bg-forest-50 p-3 text-sm text-charcoal/65">No bays yet. Use “Add bay” to create the first bay under this store.</p>
            )}
          </div>
        </article>
      ))}
      <p className="text-xs text-charcoal/60">Adding a store or bay organizes this local demo only. Device pairing and live sensor integration are not available.</p>
    </section>
  );
}
