# AeroFresh – Maize Storage Monitor (Phase 1 demo)

A browser-only demonstration of how **simulated** IoT readings can be turned into maize-storage risk alerts and
suggested interventions. **No backend, database, authentication, cloud services, AI model or hardware.**
The app always shows: *DEMO MODE — SIMULATED DATA, NO HARDWARE CONNECTED.*

## Run it

Requires Node.js 18+.

```bash
npm install
npm run dev        # open the printed URL (usually http://localhost:5173)
npm test           # unit tests for risk rules, alert dedup, simulator, reducer, storage
npm run build      # type-check + production build
```

## Try the demo (≈1 minute)

1. Pick **Rising humidity** and press **Start**. Readings arrive every 2.5 s (use 2× / 4× to speed up).
2. After ~25 s a **Persistent high ambient humidity** alert appears (warning, then critical). It stays a single alert while the condition persists.
3. Read the reason and recommended actions, then press **Acknowledge**.
4. Switch to **Recovery after intervention** and press **Send ON command** on the simulated fan. Temperature and humidity ease back to normal, the alert clears itself, and the event log records everything.
5. Try the other scenarios: rising temperature, high grain moisture (adds a grain-moisture measurement), sensor offline (readings stop; gaps in the chart; stale warning).

## How it works

| File | Role |
|---|---|
| `src/lib/simulator.ts` | Scenario engine. Gradual, bounded changes per reading; randomness is injected so it is testable. |
| `src/lib/risk.ts` | Transparent rules (`evaluateRules`), alert deduplication/cooldown (`reconcileAlerts`), overall status. |
| `src/lib/forecast.ts`, `src/lib/score.ts` | Trend projection and condition risk score (pure, unit-tested). |
| `src/lib/store.ts` | Pure reducer and app state; history capped at 100 readings. |
| `src/lib/storage.ts` | localStorage save/load with field-by-field validation; corrupt data falls back to defaults. |
| `src/components/*` | Dashboard, simulator controls, alerts, simulated fan, events, editable thresholds. |
| `tests/*` | Unit tests (Node's built-in test runner via `tsx`). |

### Rules (all thresholds are illustrative and unvalidated; editable in the UI)

- **Ambient humidity:** warning if RH ≥ 70% for 4 consecutive readings; critical if ≥ 80%.
- **Temperature:** warning ≥ 30 °C or a rise ≥ 2 °C within 6 readings; critical ≥ 35 °C.
- **Grain moisture:** evaluated *only* when the scenario supplies a measurement (warning ≥ 13.5%, critical ≥ 15.5%). It is never inferred from ambient humidity.
- **Sensor offline:** warning after 3 missed readings; critical after 9.
- **Deduplication:** one unresolved alert per rule and storage unit; severity can escalate but not duplicate; alerts auto-resolve when the condition clears; a resolved alert cannot re-fire for 20 readings (cooldown).

### Saved in localStorage

Scenario, speed, thresholds, readings, alerts (with acknowledge/resolve state), events, fan command history and fan state.
The simulator always starts paused after a reload. **Reset** (simulator) clears readings and alerts but keeps the audit log;
**Reset demo data** (header) wipes everything.

## Prediction layer (heuristic, not a trained model)

- **Trend projection** (`src/lib/forecast.ts`): straight-line fit over the last 12 contiguous valid readings, extrapolated to estimate *readings until the warning/critical limit*. It declines to project when data is too short (<6), flat, falling, noisy (R² < 0.6) or stale, and it reports a confidence level and a self-check (how wrong the projection from 5 readings ago was). It is **display-only and never creates alerts**.
- **Condition risk score** (`src/lib/score.ts`): 0–100 weighted heuristic (humidity 0.35, temperature 0.25, temperature trend 0.10, measured grain moisture 0.30). Each factor is scaled with the same editable thresholds as the alerts (0 well below warning, 50 at warning, 100 at critical), so a Warning/Critical alert always shows as at least Elevated/High. Unmeasured factors are excluded, not treated as zero; stale data shows "Unknown". Bands: Low <34, Elevated 34–66, High ≥67.
- Neither feature is validated, neither is machine learning, and neither says anything is safe. Replacing them with a trained model needs real sensor data paired with ground truth (moisture-meter readings, inspections, lab tests).

## Limitations

- All data is simulated. Thresholds are illustrative, not agronomic guidance, and have not been validated.
- Temperature and humidity readings cannot detect insects, mould or aflatoxin. “Normal” only means no demo rule is triggered; the app never labels maize safe, aflatoxin-free or pest-free.
- The fan is a software state only. Its effect on readings is modelled for the Recovery scenario and is not evidence that real ventilation would do the same; it does not change grain moisture.
- One simulated storage unit. No authentication, backend, SMS/WhatsApp notifications or hardware integration (future phases).
