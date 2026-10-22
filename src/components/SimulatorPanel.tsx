import { Pause, Play, RotateCcw } from 'lucide-react';
import { SCENARIOS, SCENARIO_IDS } from '../lib/simulator';
import type { ScenarioId, Speed } from '../lib/types';

interface Props {
  scenario: ScenarioId;
  running: boolean;
  speed: Speed;
  tick: number;
  onScenario: (id: ScenarioId) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeed: (s: Speed) => void;
}

export function SimulatorPanel(p: Props) {
  return (
    <div className="card">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold text-forest-900">Simulator</h2>
        <span className="text-xs text-charcoal/60">{p.running ? 'Running' : 'Paused'} · reading {p.tick}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {p.running ? (
          <button className="btn-primary" onClick={p.onPause}><Pause size={16} aria-hidden /> Pause</button>
        ) : (
          <button className="btn-primary" onClick={p.onStart}><Play size={16} aria-hidden /> Start</button>
        )}
        <button className="btn-ghost" onClick={p.onReset}><RotateCcw size={16} aria-hidden /> Reset</button>
        <div className="ml-auto inline-flex overflow-hidden rounded-md border border-forest-200" role="group" aria-label="Simulation speed">
          {([1, 2, 4] as Speed[]).map((s) => (
            <button
              key={s}
              aria-pressed={p.speed === s}
              onClick={() => p.onSpeed(s)}
              className={`px-2.5 py-1.5 text-sm ${p.speed === s ? 'bg-forest-800 text-white' : 'bg-white hover:bg-forest-50'}`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-1.5" role="group" aria-label="Scenario">
        {SCENARIO_IDS.map((id) => {
          const sel = p.scenario === id;
          return (
            <button
              key={id}
              aria-pressed={sel}
              onClick={() => p.onScenario(id)}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${sel ? 'border-forest-800 bg-forest-50 ring-1 ring-forest-800' : 'border-forest-100 bg-white hover:bg-forest-50'}`}
            >
              <div className="text-sm font-semibold">{SCENARIOS[id].label}</div>
              <div className="text-xs text-charcoal/65">{SCENARIOS[id].description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
