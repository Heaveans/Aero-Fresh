# AeroFresh – Cereal Storage Monitor

A browser-only demonstration of how **simulated** IoT readings can be turned into maize-storage risk alerts and
suggested interventions. **No backend, database, authentication, cloud services, AI model or hardware.**

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
2. After the ambient humidity crosses its warning threshold and persists for 6 seconds, a **Persistent high ambient humidity** alert appears (warning, then critical). It stays a single alert while the condition persists.
3. Read the reason and recommended actions, then press **Acknowledge**.
4. Switch to **Recovery after intervention** and press **Send ON command** on the simulated fan. Temperature and humidity ease back to normal, the alert clears itself, and the event log records everything.
5. Try the other scenarios: rising temperature, high grain moisture (adds a grain-moisture measurement), sensor offline (readings stop; gaps in the chart; stale warning).

## How it works

| File | Role |
|---|---|
| `src/lib/simulator.ts` | Scenario engine. Gradual, bounded changes per reading; randomness is injected so it is testable. |
| `src/lib/risk.ts` | Transparent rules (`evaluateRules`), alert deduplication/cooldown (`reconcileAlerts`), overall status. |
| `src/lib/prediction.ts` | Local linear extrapolation of recent contiguous temperature and humidity readings; not an AI model or alert. |
| `src/lib/store.ts` | Pure reducer and app state; history capped at 100 readings. |
| `src/lib/storage.ts` | localStorage save/load with field-by-field validation; corrupt data falls back to defaults. |
| `src/components/*` | Dashboard and responsive navigation, browser-persisted store/bay management, alert history export, trend summary/export, simulator controls, alerts, simulated fan, events, editable thresholds. |
| `tests/*` | Unit tests (Node's built-in test runner via `tsx`). |

### Maize default thresholds (editable in Settings)

- **Alert delay:** all demo findings must persist continuously for 6 seconds before an alert is raised; sensor-offline findings must also meet the missed-reading threshold.
- **Ambient humidity:** warning if RH ≥ 60%; critical if ≥ 65%, after the alert delay.
- **Temperature:** warning ≥ 13.5 °C or a rise ≥ 2 °C within 6 readings; critical ≥ 15 °C.
- **Grain moisture:** evaluated *only* when the scenario supplies a measurement (warning ≥ 12%, critical ≥ 13%). It is never inferred from ambient humidity.
- **Sensor offline:** warning after 3 missed readings; critical after 9.
- **Deduplication:** one unresolved alert per rule and storage unit; severity can escalate but not duplicate; alerts auto-resolve when the condition clears; a resolved alert cannot re-fire for 20 readings (cooldown).

These are the requested AeroFresh maize defaults. They are editable and have not been independently validated as agronomic guidance.

### Short-term trend outlook

The dashboard estimates temperature and ambient-humidity threshold crossings from up to six recent contiguous readings using a linear trend. It needs at least three readings, pauses estimates while the sensor is offline, and reports warning-threshold crossings only within the next 20 readings. This is an illustrative extrapolation—not a validated risk forecast, alert, AI model, or food-safety assessment. Grain moisture is intentionally excluded because it may not be measured in a scenario.

### Simulated ventilation control

Manual ON commands run for 10 seconds with no active alert or a warning alert, and 30 seconds when a critical alert is open. Automatic simulated ventilation starts when a temperature or ambient-humidity alert has remained active for another 10 seconds after being raised; it stops after valid temperature and humidity readings are both below their warning thresholds. While ON, the fan moves simulated temperature and ambient humidity toward baseline but does not change grain moisture. No physical fan, sound alarm, or external notification is connected.

### Saved in localStorage

Scenario, speed, thresholds, readings, alerts (with acknowledge/resolve state), events, fan command history and fan state.
The simulator always starts paused after a reload. **Reset** (simulator) clears readings and alerts but keeps the audit log;
**Reset demo data** (header) wipes everything.

## Limitations

- All data is simulated. The requested maize thresholds have not been independently validated as agronomic guidance.
- Temperature and humidity readings cannot detect insects, mould or aflatoxin. “Normal” only means no demo rule is triggered; the app never labels maize safe, aflatoxin-free or pest-free.
- The fan is a software state only. Its effect on readings is simulated and is not evidence that real ventilation would do the same; it does not change grain moisture.
- One simulated storage unit. No authentication, backend, SMS/WhatsApp notifications or hardware integration (future phases).
