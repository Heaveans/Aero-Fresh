import { useEffect, useReducer, useState } from 'react';
import { Droplets, Gauge, Thermometer, Trash2, Wheat } from 'lucide-react';
import { AlertsPanel } from './components/AlertsPanel';
import { AlertHistoryPanel } from './components/AlertHistoryPanel';
import { ConditionScorePanel } from './components/ConditionScorePanel';
import { EventsPanel } from './components/EventsPanel';
import { FanPanel } from './components/FanPanel';
import { MetricCard, StatusCard } from './components/Metrics';
import { PredictionPanel } from './components/PredictionPanel';
import { RulesPanel } from './components/RulesPanel';
import { Sidebar, type PageId } from './components/Sidebar';
import { SimulatorPanel } from './components/SimulatorPanel';
import { StoresPanel } from './components/StoresPanel';
import { TrendChart } from './components/TrendChart';
import { TrendSummary } from './components/TrendSummary';
import { fmtTime } from './lib/format';
import { lastValid, overallStatus } from './lib/risk';
import { computeConditionScore } from './lib/score';
import { BASE_INTERVAL_MS, SCENARIOS, UNIT_NAME, makeNoise } from './lib/simulator';
import { clearPersisted, loadPersisted, savePersisted } from './lib/storage';
import { initState, reducer } from './lib/store';

const tickAction = () => ({ type: 'tick' as const, now: Date.now(), noise: makeNoise() });

export default function App() {
  const [s, dispatch] = useReducer(reducer, undefined, () => initState(loadPersisted()));
  const [page, setPage] = useState<PageId>('dashboard');

  // Generate a reading every 2.5 s (divided by the speed multiplier) while running.
  useEffect(() => {
    if (!s.running) return;
    const id = setInterval(() => dispatch(tickAction()), BASE_INTERVAL_MS / s.speed);
    return () => clearInterval(id);
  }, [s.running, s.speed]);

  useEffect(() => {
    if (s.fanMode !== 'manual' || s.fanUntilAt === null) return;
    const timeout = window.setTimeout(
      () => dispatch({ type: 'fanTimeout', now: Date.now() }),
      Math.max(0, s.fanUntilAt - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [s.fanMode, s.fanUntilAt]);

  useEffect(() => savePersisted(s), [s]);

  const level = overallStatus(s.alerts);
  const openAlerts = s.alerts.filter((a) => a.status !== 'resolved').length;
  const lv = lastValid(s.history);
  const stale = s.sim.missedTicks >= s.thresholds.staleReadings;
  const staleNote = lv ? `Stale: last valid reading at ${fmtTime(lv.t)}` : 'No valid reading';
  const note = (live: string) => (stale ? staleNote : lv ? `Updated ${fmtTime(lv.t)}` : live);
  const moisture = lv?.moisture ?? null;
  const conditionScore = computeConditionScore(s.history, s.sim.missedTicks, s.thresholds);

  const start = () => {
    dispatch({ type: 'start' });
    dispatch(tickAction()); // show a reading immediately
  };

  const thresholdProps = {
    th: s.thresholds,
    onChange: (key: keyof typeof s.thresholds, value: number) => dispatch({ type: 'setThreshold', key, value }),
    onDefaults: () => dispatch({ type: 'resetThresholds' }),
  };
  const simulatorProps = {
    scenario: s.scenario,
    running: s.running,
    speed: s.speed,
    tick: s.sim.tick,
    onScenario: (id: typeof s.scenario) => dispatch({ type: 'setScenario', id, now: Date.now() }),
    onStart: start,
    onPause: () => dispatch({ type: 'pause' }),
    onReset: () => dispatch({ type: 'resetSim', now: Date.now() }),
    onSpeed: (speed: typeof s.speed) => dispatch({ type: 'setSpeed', speed }),
  };
  const alertsProps = {
    alerts: s.alerts,
    onAck: (id: string) => dispatch({ type: 'ack', id, now: Date.now() }),
    onResolve: (id: string) => dispatch({ type: 'resolve', id, now: Date.now() }),
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-forest-100 bg-forest-800 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Wheat className="text-maize-400" size={28} aria-hidden />
            <div>
              <h1 className="font-display text-xl font-bold leading-tight">AeroFresh</h1>
              <p className="text-xs text-forest-100">Cereal Storage Monitor</p>
              <p className="text-xs text-forest-100">{UNIT_NAME}</p>
            </div>
          </div>
          <button
            className="btn border-white/40 bg-transparent text-white hover:bg-white/10"
            onClick={() => {
              if (window.confirm('Reset all demo data (settings, readings, alerts and history)?')) {
                clearPersisted();
                dispatch({ type: 'resetAll' });
              }
            }}
          >
            <Trash2 size={16} aria-hidden /> Reset demo data
          </button>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
        <Sidebar page={page} onNavigate={setPage} />
        <main className="min-w-0 p-4 sm:p-6">
          <div className="mx-auto grid max-w-6xl gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-forest-900">
                {page === 'dashboard' && 'Dashboard'}
                {page === 'stores' && 'Stores and bays'}
                {page === 'alerts' && 'Alert History'}
                {page === 'trends' && 'Trend History and summary'}
                {page === 'settings' && 'Settings'}
              </h1>
              <p className="mt-1 text-sm text-charcoal/65">
                {page === 'dashboard' && 'Live status and simulated monitoring controls.'}
                {page === 'stores' && 'Storage units available in this local demo.'}
                {page === 'alerts' && 'Review and export the complete alert record.'}
                {page === 'trends' && 'Explore retained readings and descriptive summaries.'}
                {page === 'settings' && 'Demo account information and editable rule thresholds.'}
              </p>
            </div>

            {page === 'dashboard' && (
              <>
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatusCard level={level} openAlerts={openAlerts} />
                  <MetricCard icon={<Thermometer size={18} aria-hidden />} label="Temperature" sensorType="DS18B20" value={lv?.temp != null ? lv.temp.toFixed(1) : null} unit="°C" note={note('Press Start to begin')} stale={stale} />
                  <MetricCard icon={<Droplets size={18} aria-hidden />} label="Ambient relative humidity" sensorType="SHT31" value={lv?.rh != null ? lv.rh.toFixed(1) : null} unit="%" note={note('Air humidity, not grain moisture')} stale={stale} />
                  <MetricCard icon={<Gauge size={18} aria-hidden />} label="Grain moisture" value={moisture !== null ? moisture.toFixed(1) : null} unit="%" note={moisture !== null ? note('') : 'Not measured in this scenario'} stale={stale && moisture !== null} />
                </section>

                <section className="grid items-start gap-4 xl:grid-cols-3">
                  <TrendChart
                    history={s.history}
                    th={s.thresholds}
                    missedTicks={s.sim.missedTicks}
                    className="xl:col-span-2"
                  />
                  <SimulatorPanel {...simulatorProps} />
                </section>

                <section className="grid items-start gap-4 xl:grid-cols-3">
                  <div className="xl:col-span-2"><AlertsPanel {...alertsProps} /></div>
                  <FanPanel fanOn={s.fanOn} fanMode={s.fanMode} fanUntilAt={s.fanUntilAt} alerts={s.alerts} scenario={s.scenario} interventions={s.interventions} onCommand={(command) => dispatch({ type: 'fan', command, now: Date.now() })} />
                </section>

                <section className="grid items-start gap-4 xl:grid-cols-3">
                  <PredictionPanel
                    history={s.history}
                    thresholds={s.thresholds}
                    missedTicks={s.sim.missedTicks}
                    className="xl:col-span-2"
                  />
                  <ConditionScorePanel result={conditionScore} />
                </section>
                <EventsPanel events={s.events} />
              </>
            )}

            {page === 'stores' && (
              <StoresPanel
                stores={s.stores}
                monitoredUnitId="SU-01"
                temperature={lv?.temp ?? null}
                humidity={lv?.rh ?? null}
                openAlerts={openAlerts}
                stale={stale}
                onAddStore={(name) => dispatch({ type: 'addStore', name, now: Date.now() })}
                onAddBay={(storeId, name) => dispatch({ type: 'addBay', storeId, name, now: Date.now() })}
                onOpenDashboard={() => setPage('dashboard')}
              />
            )}

            {page === 'alerts' && <AlertHistoryPanel alerts={s.alerts} />}

            {page === 'trends' && (
              <>
                <TrendSummary history={s.history} />
                <TrendChart history={s.history} th={s.thresholds} missedTicks={s.sim.missedTicks} />
                <section className="grid items-start gap-4 xl:grid-cols-3">
                  <PredictionPanel
                    history={s.history}
                    thresholds={s.thresholds}
                    missedTicks={s.sim.missedTicks}
                    className="xl:col-span-2"
                  />
                  <ConditionScorePanel result={conditionScore} />
                </section>
                <EventsPanel events={s.events} />
              </>
            )}

            {page === 'settings' && (
              <>
                <section className="card">
                  <h2 className="font-display text-lg font-bold text-forest-900">Account</h2>
                  <p className="mt-1 text-sm text-charcoal/65">This browser-only demo does not use sign-in or a user account.</p>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-charcoal/60">Profile</dt><dd className="font-medium">Local demo user</dd></div>
                    <div><dt className="text-charcoal/60">Data storage</dt><dd className="font-medium">This browser’s local storage</dd></div>
                  </dl>
                </section>
                <RulesPanel {...thresholdProps} defaultOpen />
                <section className="card">
                  <h2 className="font-display text-lg font-bold text-forest-900">Demo data</h2>
                  <p className="mt-1 text-sm text-charcoal/65">Reset readings and alerts from the Dashboard simulator, or use “Reset demo data” to clear all locally saved settings and history.</p>
                </section>
              </>
            )}

            <footer className="pb-4 text-xs text-charcoal/65">
              Current scenario: {SCENARIOS[s.scenario].label}. Phase 1 demo: all readings are generated in your browser; no sensors, backend or AI model are involved.
              Temperature and humidity readings cannot detect insects, mould or aflatoxin directly. Thresholds are illustrative and unvalidated.
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
