import { useEffect, useMemo, useReducer } from 'react';
import { Droplets, Gauge, Thermometer, Trash2, Wheat } from 'lucide-react';
import { Banner } from './components/Banner';
import { AlertsPanel } from './components/AlertsPanel';
import { EventsPanel } from './components/EventsPanel';
import { FanPanel } from './components/FanPanel';
import { MetricCard, StatusCard } from './components/Metrics';
import { OutlookPanel } from './components/OutlookPanel';
import { ScoreCard } from './components/ScoreCard';
import { RulesPanel } from './components/RulesPanel';
import { SimulatorPanel } from './components/SimulatorPanel';
import { TrendChart } from './components/TrendChart';
import { fmtTime } from './lib/format';
import { forecastAll, outlookText } from './lib/forecast';
import { lastValid, overallStatus } from './lib/risk';
import { computeScore } from './lib/score';
import { BASE_INTERVAL_MS, SCENARIOS, UNIT_NAME, makeNoise } from './lib/simulator';
import { clearPersisted, loadPersisted, savePersisted } from './lib/storage';
import { initState, reducer } from './lib/store';

const tickAction = () => ({ type: 'tick' as const, now: Date.now(), noise: makeNoise() });

export default function App() {
  const [s, dispatch] = useReducer(reducer, undefined, () => initState(loadPersisted()));

  // Generate a reading every 2.5 s (divided by the speed multiplier) while running.
  useEffect(() => {
    if (!s.running) return;
    const id = setInterval(() => dispatch(tickAction()), BASE_INTERVAL_MS / s.speed);
    return () => clearInterval(id);
  }, [s.running, s.speed]);

  useEffect(() => savePersisted(s), [s]);

  const forecasts = useMemo(() => forecastAll(s.history, s.sim.missedTicks, s.thresholds), [s.history, s.sim.missedTicks, s.thresholds]);
  const score = useMemo(() => computeScore(s.history, s.sim.missedTicks, s.thresholds), [s.history, s.sim.missedTicks, s.thresholds]);
  const level = overallStatus(s.alerts);
  const openAlerts = s.alerts.filter((a) => a.status !== 'resolved').length;
  const lv = lastValid(s.history);
  const stale = s.sim.missedTicks >= s.thresholds.staleReadings;
  const staleNote = lv ? `Stale: last valid reading at ${fmtTime(lv.t)}` : 'No valid reading';
  const note = (live: string) => (stale ? staleNote : lv ? `Updated ${fmtTime(lv.t)}` : live);
  const moisture = lv?.moisture ?? null;

  const start = () => {
    dispatch({ type: 'start' });
    dispatch(tickAction()); // show a reading immediately
  };

  return (
    <div className="min-h-screen">
      <Banner />
      <header className="border-b border-forest-100 bg-forest-800 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Wheat className="text-maize-400" size={28} aria-hidden />
            <div>
              <h1 className="font-display text-xl font-bold leading-tight">AeroFresh</h1>
              <p className="text-xs text-forest-100">Maize storage monitor · {UNIT_NAME}</p>
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

      <main className="mx-auto grid max-w-6xl gap-4 p-4">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard level={level} openAlerts={openAlerts} />
          <MetricCard
            icon={<Thermometer size={18} aria-hidden />}
            label="Temperature"
            value={lv?.temp != null ? lv.temp.toFixed(1) : null}
            unit="°C"
            note={note('Press Start to begin')}
            stale={stale}
            forecast={forecasts.temp}
            outlook={forecasts.temp && lv ? outlookText(forecasts.temp, s.speed) : undefined}
          />
          <MetricCard
            icon={<Droplets size={18} aria-hidden />}
            label="Ambient relative humidity"
            value={lv?.rh != null ? lv.rh.toFixed(1) : null}
            unit="%"
            note={note('Air humidity, not grain moisture')}
            stale={stale}
            forecast={forecasts.rh}
            outlook={forecasts.rh && lv ? outlookText(forecasts.rh, s.speed) : undefined}
          />
          <MetricCard
            icon={<Gauge size={18} aria-hidden />}
            label="Grain moisture"
            value={moisture !== null ? moisture.toFixed(1) : null}
            unit="%"
            note={moisture !== null ? note('') : 'Not measured in this scenario'}
            stale={stale && moisture !== null}
            forecast={forecasts.moisture}
            outlook={forecasts.moisture ? outlookText(forecasts.moisture, s.speed) : undefined}
          />
        </section>

        <section className="grid items-start gap-4 lg:grid-cols-3">
          <TrendChart history={s.history} th={s.thresholds} forecasts={forecasts} className="lg:col-span-2" />
          <SimulatorPanel
            scenario={s.scenario}
            running={s.running}
            speed={s.speed}
            tick={s.sim.tick}
            onScenario={(id) => dispatch({ type: 'setScenario', id, now: Date.now() })}
            onStart={start}
            onPause={() => dispatch({ type: 'pause' })}
            onReset={() => dispatch({ type: 'resetSim', now: Date.now() })}
            onSpeed={(speed) => dispatch({ type: 'setSpeed', speed })}
          />
        </section>

        <section className="grid items-start gap-4 lg:grid-cols-3">
          <ScoreCard result={score} />
          <div className="lg:col-span-2">
            <OutlookPanel forecasts={forecasts} history={s.history} speed={s.speed} />
          </div>
        </section>

        <section className="grid items-start gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AlertsPanel
              alerts={s.alerts}
              onAck={(id) => dispatch({ type: 'ack', id, now: Date.now() })}
              onResolve={(id) => dispatch({ type: 'resolve', id, now: Date.now() })}
            />
          </div>
          <FanPanel
            fanOn={s.fanOn}
            scenario={s.scenario}
            interventions={s.interventions}
            onCommand={(command) => dispatch({ type: 'fan', command, now: Date.now() })}
          />
        </section>

        <section className="grid items-start gap-4 lg:grid-cols-2">
          <EventsPanel events={s.events} />
          <RulesPanel
            th={s.thresholds}
            onChange={(key, value) => dispatch({ type: 'setThreshold', key, value })}
            onDefaults={() => dispatch({ type: 'resetThresholds' })}
          />
        </section>

        <footer className="pb-6 text-xs text-charcoal/65">
          Current scenario: {SCENARIOS[s.scenario].label}. Phase 1 demo: all readings are generated in your browser; no sensors, backend or AI model are involved.
          Temperature and humidity readings cannot detect insects, mould or aflatoxin directly. Thresholds are illustrative and unvalidated.
        </footer>
      </main>
    </div>
  );
}
