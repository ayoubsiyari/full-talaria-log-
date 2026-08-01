# Kill-switch inventory — D-5 single push

**Owner:** Manager B (release) · updated 2026-07-28 20:05  
**Standard:** every change that can hurt a user at runtime must disable behind an explicit vocabulary; anything unrecognised leaves the protection ON. A switch that has never been shown to disable its feature is not a switch.

**Phantom cleared:** `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1` is FIX 1's flag and FIX 1 is **not in the train**. It is reserved for A's last item; it is **not** a release precondition. See `TRAIN-SHIP-GO-20260728-2000.md` and `UNBLOCK-B-PHANTOM-GATE-20260728-1958.md`.

---

## 1. Inventory (train ship set)

| # | Feature | Switch | Default | How to throw | Takes effect | Disable proven by |
|---|---|---|---|---|---|---|
| 1 | Client hydration guard (B-W16) | `window.__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | unset → **guard ON** | Console: `= true` | Next durable write; no redeploy | B-W18 mutants 6/0 |
| 2 | Backend parse guard (B-W17) | env `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` | unset → **guard ON** | Set `false`/`0`/`no`/`off`, restart trading-chart | On restart | B-W18 mutants 6/0 |
| 3 | Deletion logging | *(none, deliberate)* | always on | — | — | N/A |
| 4 | M26 panel replay destroy | `window.__TALARIA_DISABLE_M26_PANEL_REPLAY_DESTROY_V1` | unset → **fix ON** | Console: `= true` | Next panel teardown | A m26 tests |
| 5 | M27 engine release | `window.__TALARIA_DISABLE_M27_ENGINE_RELEASE_V1` | unset → **fix ON** | Console: `= true` | Next drain | A m27 tests |
| 6 | M28 hidden-pause (FIX 3) | `window.__TALARIA_DISABLE_REPLAY_HIDDEN_PAUSE_V1` | unset → **fix ON** | Console: `= true` | Next visibility change | A m28 tests |
| 7 | R1 M23 host-commit teardown | `window.__TALARIA_DISABLE_M23_HOST_COMMIT_TEARDOWN_V1` | unset → **fix ON** | Console: `= true` | Per-call | A r1-render-killswitches 26/26 |
| 8 | R1 M20-Q9 counters | `window.__TALARIA_DISABLE_M20_Q9_MCDIAG_COUNTERS_V1` | unset → **fix ON** | Console: `= true` | Per-call | A r1 (Q9 recovery cut) |

**Not in train (do not block ship):**

| Feature | Switch (reserved) | Status |
|---|---|---|
| FIX 1 background-panel render cadence | `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1` | Not built; A last |
| P2 order-line eviction rescope | `__TALARIA_DISABLE_M24_ORDER_EVICTION_SCOPE_V1` | A residual |
| P3 IndicatorPerf loader | `__TALARIA_DISABLE_INDICATOR_PERF_BRIDGE_V1` | A residual |
| P4 module-presence tripwire | `__TALARIA_DISABLE_MODULE_PRESENCE_TRIPWIRE_V1` | A residual |

---

## 1b. Phantom levers — do not pull (canary runbook)

| Name that may appear in docs/RED packets | Reality |
|---|---|
| `__TALARIA_DISABLE_M20_Q4_TRAIL_SL_PATH_CAP_V1` | **Does not exist in product.** It is only a `killSwitchProposed` string in RED/contract fixtures (`m20-q4-trail-sl-path-cap.red.test.mjs`, `m20-a1-screenshot-idb-contract.mjs`). The trail-SL push sites in `order-manager.js` are **ungated**. Setting `window.__TALARIA_DISABLE_M20_Q4_TRAIL_SL_PATH_CAP_V1 = true` in an incident **changes nothing**. Do not treat it as a rollback lever. |

---

## 2. Disable vocabulary (B guards)

| Switch | Values that DISABLE | Everything else |
|---|---|---|
| `__TALARIA_DISABLE_B_W16_HYDRATION_GUARD_V1` | `true`, `1`, `'1'`, `'true'`, `'yes'`, `'on'` | guard stays ON |
| `JOURNAL_SWEEP_PARSE_GUARD_ENABLED` | `0`, `false`, `no`, `off` | guard stays ON |

A's switches use strict `=== true` (flag-on disables the fix / restores prior behaviour). Absent property = fix ON.

---

## 3. Rehearsal

```
node chart\ v\ 1.4/chart/modules/b-w18-killswitch.mutants.mjs
```

Last B rehearsal: 6/0 survived; VER-04 both halves; byte-exact restore.
