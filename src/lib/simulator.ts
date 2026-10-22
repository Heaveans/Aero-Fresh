/**
 * In-browser sensor simulator. Pure and UI-independent: randomness is injected
 * (`noise`), so output is deterministic in tests. All data is simulated.
 */
import type { Reading, ScenarioId, SimState } from './types';

export const UNIT_ID = 'SU-01';
export const UNIT_NAME = 'Var -A (Maize) Store 1 Bay A';
export const BASE_INTERVAL_MS = 2500;
const BASELINE_TEMP = 12.5;
export const INITIAL_SIM: SimState = { tick: 0, temp: BASELINE_TEMP, rh: 55, moisture: null, missedTicks: 0 };

interface ScenarioDef {
  label: string;
  description: string;
  tempTarget?: number;
  rhTarget?: number;
  tempStep: number; // max °C change per reading
  rhStep: number; // max % change per reading
  moisture: 'off' | 'rise' | 'hold'; // 'off' = scenario supplies no grain-moisture measurement
  offline?: boolean;
  fanDriven?: boolean; // targets are only pursued while the simulated fan is ON
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  normal: { label: 'Normal storage', description: 'Stable temperature and humidity.', tempTarget: BASELINE_TEMP, rhTarget: 55, tempStep: 0.3, rhStep: 1, moisture: 'off' },
  rising_humidity: { label: 'Rising humidity', description: 'Ambient humidity climbs steadily.', tempTarget: 13, rhTarget: 92, tempStep: 0.2, rhStep: 2, moisture: 'off' },
  rising_temperature: { label: 'Rising temperature', description: 'Store temperature climbs steadily.', tempTarget: 20, rhTarget: 55, tempStep: 0.5, rhStep: 0.5, moisture: 'off' },
  high_grain_moisture: { label: 'High grain moisture', description: 'Adds a grain-moisture measurement that climbs.', tempTarget: BASELINE_TEMP, rhTarget: 58, tempStep: 0.2, rhStep: 0.5, moisture: 'rise' },
  sensor_offline: { label: 'Sensor offline', description: 'Readings stop arriving.', tempStep: 0, rhStep: 0, moisture: 'hold', offline: true },
  recovery: { label: 'Recovery after intervention', description: 'Readings ease back toward baseline while the simulated fan is ON. Grain moisture is not changed.', tempTarget: BASELINE_TEMP, rhTarget: 55, tempStep: 0.6, rhStep: 1.5, moisture: 'hold', fanDriven: true },
};
export const SCENARIO_IDS = Object.keys(SCENARIOS) as ScenarioId[];

const MOISTURE_START = 12.8;
const MOISTURE_CAP = 16.5;
const MOISTURE_STEP = 0.15;

/** Three noise samples in [-1, 1]. */
export type Noise = [number, number, number];
export const makeNoise = (rand: () => number = Math.random): Noise => [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];

const toward = (cur: number, target: number, step: number) =>
  cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Advance the simulation by one reading interval. Changes are gradual (bounded per step). */
export function stepSim(sim: SimState, scenario: ScenarioId, fanOn: boolean, noise: Noise, now: number): { sim: SimState; reading: Reading } {
  const def = SCENARIOS[scenario];
  const tick = sim.tick + 1;

  if (def.offline) {
    return {
      sim: { ...sim, tick, missedTicks: sim.missedTicks + 1 },
      reading: { t: now, tick, unitId: UNIT_ID, temp: null, rh: null, moisture: null, offline: true },
    };
  }

  let { temp, rh, moisture } = sim;
  if (fanOn) {
    temp = toward(temp, BASELINE_TEMP, 0.6);
    rh = toward(rh, 55, 1.5);
  } else if (!def.fanDriven) {
    if (def.tempTarget !== undefined) temp = toward(temp, def.tempTarget, def.tempStep);
    if (def.rhTarget !== undefined) rh = toward(rh, def.rhTarget, def.rhStep);
  }
  temp = clamp(temp, 8, 45);
  rh = clamp(rh, 20, 99);

  if (def.moisture === 'off') moisture = null;
  else if (def.moisture === 'rise') moisture = Math.min(MOISTURE_CAP, toward(moisture ?? MOISTURE_START, MOISTURE_CAP, MOISTURE_STEP));

  const next: SimState = { tick, temp, rh, moisture, missedTicks: 0 };
  return {
    sim: next,
    reading: {
      t: now,
      tick,
      unitId: UNIT_ID,
      temp: r1(temp + noise[0] * 0.15),
      rh: r1(clamp(rh + noise[1] * 0.5, 0, 100)),
      moisture: moisture === null ? null : r1(moisture + noise[2] * 0.05),
      offline: false,
    },
  };
}
