# T8 step 12 — finest-TF unified replay clock design report (D-016)

## 1. Task + RC

- **Task:** `T8-step12-lane2-finest-tf-cadence-design.md` — design doc FIRST + mandatory measured cost column; implementation gated on frame budget.
- **RC:** **RC-8** (cadence policy / ESC-014). Design-only this step — no product fix.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `docs/tickets-overhaul/T8-FINEST-TF-CADENCE-DESIGN.md` | **Added** — clock ownership, coalesce proof plan, live re-derivation, measured cost column, H-S82 RED spec, kill-switch / I8–I9 plan |
| `chart v 1.4/chart/multichart-prod/harness/t8-step12-cadence-cost-probe.mjs` | **Added** — D-016 cost probe (4-panel 1m/4h, max speed, 8s production tick play, frame-time + render counters) |
| `docs/tickets-overhaul/worker-reports/T8-step12-finest-tf-cadence-design-report.md` | This report |

**Explicit:** no product files touched. No I8 mirror edits. `react-parity-lib.mjs` not touched.

---

## 3. Kill-switch (I3 + I13)

**Design names (impl step):**

| Switch | Default at staging impl | OFF = revert |
|--------|-------------------------|--------------|
| `__TALARIA_MC_FINEST_TF_REPLAY_CADENCE` | ON (worker-prompt name) | — |
| `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` | unset (D-016 authoritative OFF switch) | Today’s selected-panel step TF exactly |

**Files to gate at impl:** `replay-system.js`, `panel-cmd-bridge.js`, `MultichartGrid.jsx` (+ I8 mirrors). Switch OFF must restore `_resolveReplayStepTimeframe()` cadence with zero behavior delta.

**This step:** switches documented only — not wired.

---

## 4. Proof — RED → GREEN

### Design deliverable

`docs/tickets-overhaul/T8-FINEST-TF-CADENCE-DESIGN.md` — complete per worker prompt §Deliverable.

### Measured cost column (mandatory)

```text
cd "chart v 1.4/chart/multichart-prod/harness"
node t8-step12-cadence-cost-probe.mjs
```

**Key output (2026-07-15 run):**

| Metric | BEFORE (measured) | AFTER (projection) |
|--------|-------------------|-------------------|
| Host `_multichartBroadcastReplayFrame` p95 | **0.2 ms** | same architecture + coalesce |
| 4h panel C follow renders / 8s | **2** | ~7 per **full** 4h bar |
| 4h follow / pixel column | **0.022** | ≤ 1.0 (H-S19b bound) |
| Parity `replayTs` all panels | **match** | required invariant |
| Verdict | **WITHIN_FRAME_BUDGET** | implementation authorized |

Full JSON in probe stdout; summarized in design doc §5.

### RED spec

**H-S82** specified in design doc §6 — not yet added to `scenarios.mjs` (implementation step, RED-first).

### Gate

Not run — design-only step. Fence plan: H-S17, H-S19, H-S19b, H-S59b + new H-S82 at impl.

### I15

Probe uses **production tick play** (`rs.play()` + `replayPlay` broadcast, no synthetic `hostReplaySeek` loop). Measurements are **timestamp + render counters** (not proxy DOM). Cadence feel remains **NEEDS-LIVE** at impl.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I1–I2 (scope) | Design + probe only; no product behavior change |
| I3 / I13 | Kill-switch named; gating deferred to impl |
| I8 | Not touched this step; mirror plan documented |
| I10 | Live re-derivation design: edge-triggered only |
| I14 | Called out for impl (iframe coordination) |
| I15 | Counter/timestamp measurements honest; no proxy-green fix claim |
| D-016 | Measured cost column present; no silent decoupled degrade |
| D-015 | Edge-park untouched in design |

---

## 6. What I did NOT do / limits

- **No implementation** — host tick source still uses `_resolveReplayStepTimeframe()`, not `min(TF)`.
- **H-S82 not committed** to `scenarios.mjs` — spec only.
- **BEFORE column** measures host-already-1m layout (finest TF in grid). Does **not** measure the PO’s broken path (4h **selected**, 1m panels jump 4h) — that path is lower render cost but wrong cadence; AFTER fixes granularity, not coalesce architecture.
- **FastMode** engaged at max speed (16 host broadcasts / 8s) — smooth tick-mode supplementary probe not run; design doc notes fastMode is expected at max slider.
- **Partial coarse bar** in 8s window — `renderPerCoarseBar` extrapolation misleading; design doc uses pixel-column metrics (H-S19b).
- **No staging PO A/B** — design step only.
- **Kill-switch naming:** worker prompt uses `__TALARIA_MC_FINEST_TF_REPLAY_CADENCE`; D-016 uses `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` — design doc lists both; impl should follow D-016 DISABLE pattern.

---

## 7. Live-verification handoff

**At implementation (not this step):**

1. Staging build with finest-TF cadence ON.
2. 4-panel layout: two 1m + two 4h, sync OFF.
3. Focus **4h panel**, max speed tick play.
4. Confirm: 1m panels advance smoothly; 4h candles form progressively; no panel shows a different market timestamp.
5. Toggle `window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE = true`, reload — confirm revert to today’s 4h jump cadence on 1m panels.
6. PO A/B is **deciding authority** for feel (D-016).

---

## 8. Status

**DIAGNOSTIC-ONLY (design + measurement complete, fix not started)** — with **implementation authorized**.

Cost column verdict: **WITHIN FRAME BUDGET** (host broadcast p95 0.2 ms; 4h follow coalesce 2 renders / 91 pixel columns). Does **not** return to Director. Next worker step: implement behind DISABLE switch, add H-S82 RED, re-run probe for AFTER column, staging PO confirm.
