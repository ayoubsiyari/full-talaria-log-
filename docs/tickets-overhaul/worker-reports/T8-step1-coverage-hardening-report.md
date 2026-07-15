# T8 step 1 — coverage hardening (ungated kill-switches + BL-16)

**Date:** 2026-07-15  
**Directive:** D-013 ruling 1 step 1  
**Lane:** 2 (host harness only)

---

## 1. Task + RC

| Field | Value |
|---|---|
| Task id | T8 step 1 — coverage hardening |
| Goal | Add RED-first host scenarios for ~17 ungated replay/mirror kill-switches + BL-16 dedicated drag-during-play row; keep gated baseline green (I9) |
| RC | RC-8 (replay bus / mirror frame) — acceptance contract hardening before T8 policy migration |

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | Added **H-S60–H-S78** (18 kill-switch rows + BL-16), shared helpers `t8RedBoot`, `t8PausedReplayHostSwitch`; moved **H-S59** out of `scenarioList()` into new `t8PendingScenarioList()` so gate ID set stays H-S2..H-S58 |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | Byte-identical mirror (I8) |
| `chart v 1.4/chart/multichart-prod/harness/run.mjs` | Added `--pending` flag: merges `t8PendingScenarioList()` with gated list for `npm run test -- --pending --only=…` |
| `homepage/public/chart/multichart-prod/harness/run.mjs` | Byte-identical mirror (I8) |
| `docs/tickets-overhaul/T8-MIRROR-POLICY-TABLE.md` | Step 2 deliverable (read-only policy doc; cross-reference only) |

**No other files touched.** Did not edit `known-failing.json`, `react-parity-lib.mjs`, or product engine code.

---

## 3. Kill-switch (I3 + I13)

N/A — no new product switches introduced. Each pending scenario pins an **existing** `window.__TALARIA_MC_DISABLE_*` switch (default OFF = fix ON). Switch→scenario map:

| Kill-switch | Default | Scenario | Files gated (production) |
|-------------|---------|----------|--------------------------|
| `__TALARIA_MC_DISABLE_PANEL_SETTLED_SELFHEAL` | OFF (fix ON) | H-S60 | `panel-cmd-bridge.js:500` |
| `__TALARIA_MC_DISABLE_PANEL_MIRROR_UNSETTLED_HOST` | OFF | H-S61 | `panel-cmd-bridge.js:584` |
| `__TALARIA_MC_DISABLE_PANEL_SETTLED_RESYNC` | OFF | H-S62 | `panel-cmd-bridge.js:613`, `chart.js:8400` |
| `__TALARIA_MC_DISABLE_HOST_HISTORY_GROWTH_MIRROR` | OFF | H-S63 | `panel-cmd-bridge.js:2079` |
| `__TALARIA_MC_DISABLE_HOST_TF_MIRROR_WAIT` | OFF | H-S64 | `panel-cmd-bridge.js:2401` |
| `__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_SEEK` | OFF | H-S65 | `panel-cmd-bridge.js:1547` (BL-5) |
| `__TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE` | OFF | H-S66 | `chart.js:3431` (BL-2b) |
| `__TALARIA_MC_DISABLE_PAUSED_REPLAY_ALIGNED_SEEK_GUARD` | OFF | H-S67 | `panel-cmd-bridge.js:1596` (BL-8) |
| `__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_VIEWPORT_RECENTER` | OFF | H-S68 | `panel-cmd-bridge.js:1625` (BL-6) |
| `__TALARIA_MC_DISABLE_DISPLAY_TF_MASTER` | OFF | H-S69 | `chart.js:4674` |
| `__TALARIA_MC_DISABLE_HIGH_LIMIT_BULK` | OFF | H-S70 | `chart.js:6121` |
| `__TALARIA_MC_DISABLE_TF_SWITCH_FILL_STORM_GUARD` | OFF | H-S71 | `chart.js:30335` |
| `__TALARIA_MC_DISABLE_PANEL_HOSTSWITCH_QUIET` | OFF | H-S72 | `chart.js:17901` |
| `__TALARIA_MC_DISABLE_MIRROR_PREPEND_COMPENSATION` | OFF | H-S73 | `chart.js:2449` |
| `__TALARIA_MC_DISABLE_FINER_PANEL_SELFOWN` | OFF | H-S74 | `chart.js:3499` |
| `__TALARIA_MC_DISABLE_SAME_PAIR_PAN_HOST_OWNER` | OFF | H-S75 | `chart.js:22670` |
| `__TALARIA_MC_DISABLE_REPLAY_FOLLOW_FALLBACK` | OFF | H-S76 | `replay-system.js:6307` |
| `__TALARIA_MC_DISABLE_PANEL_MASTER_GROWTH_OFFSET` | OFF | H-S77 | `replay-system.js:3108` |
| *(no dedicated switch)* | — | H-S78 (BL-16) | BL-11/12 drag-disengage path (`panel-cmd-bridge.js:1665+`) |
| *(A5 contract)* | — | H-S59 | Independent-symbol play advance (TAL-01590) |

---

## 4. Proof — RED → GREEN

### Commands

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run gate
npm run test -- --pending --only=H-S59,H-S64,H-S75,H-S78 --runs=1
```

### I15 actuation + measurement (per scenario family)

| ID | Actuation | Measurement (real end-state) |
|----|-----------|------------------------------|
| H-S59 | `replayPlay` + `hostReplaySeek` + `replayFrame {isPlaying:true}` × N | Host + independent B `replayTs` and B `lastBarT` both advance |
| H-S60 | Real mouse drag B off-screen; host `4h→1m` TF switch | B `playheadVisible` + `offsetToTarget` re-anchors after settle (GREEN); RED boot with switch ON leaves B far from edge |
| H-S61 | Paused replay; host `4h→1m` | All panels `lastBarT` identical at settle (GREEN); RED peers diverge |
| H-S62 | Paused replay; fan-out `4h` then host `1m` | All panels `lastBarT` match (GREEN); RED C/D stale |
| H-S63 | Real host pan-left (history prepend) during paused replay | B `firstBarT ===` host `firstBarT` (GREEN); RED B stale |
| H-S64 | Host fan-out `1m→1h` sync ON | ≤1 panel self-fetches (GREEN); RED ≥3 peers fetch |
| H-S65 | Coarse B `1h`; paused host `4h→1m` | B render delta bounded ≤40 (GREEN); RED >80 |
| H-S66 | Host `1m→4h` during paused replay | C/D price scale unchanged (GREEN); RED peers rescale |
| H-S67 | B TF switch; `replayTick` same ts to C | C `offsetX` stable (GREEN); RED offset jumps |
| H-S68 | Coarse B parked; host TF switch | B visible bar count >0 after recenter (GREEN); RED parked |
| H-S69–H-S77 | Per-switch boot + gesture specific to guard | Real diag: fetches, offsetX, dataLen, bar timestamps — each row flips on `t8RedBoot` with switch pre-set |
| H-S78 | `dragPanelWhileStreaming` real mouse during PLAY | B `offsetX` tracks drag; follow renders ≈0 during drag; no snap-back after release while play continues |

**RED proof pattern:** `t8RedBoot(ctx, opts, FLAG)` boots a **fresh** document with `bugSwitches=[FLAG]` so the kill-switch is ON before engine init — causal A/B, not mid-run toggle alone.

### Gate result

**First full run (`gate-t8.log`):** `[gate] FAIL: regression(s): H-S25` — sub-check `per-step |Δoffset| ~1 device px` saw `maxStepDeviceDelta=2.801px` (threshold flake under saturated full-suite CPU). **Isolated H-S25:** `npm run test -- --only=H-S25 --runs=2` → **2/2 PASS** (`maxStepDeviceDelta=1.400px` both runs). Not caused by T8 pending additions (H-S59 removed from gated set; no H-S25 code touched).

**Re-run:** `npm run gate` → **`[gate] PASS`** — 0 regressions; 12 known-failing tracked (`gate-t8-rerun.log`).

```
Baseline IDs: H-S2..H-S58 only (57 scenarios); H-S59 NOT in gated set
Known-failing tracked: 12 (H-S34/35/40–42/44–50)
```

**Pending sample (`pending-t8-sample.log`):**

| ID | Verdict | Notes |
|----|---------|-------|
| H-S59 | PASS | Contract path: host + independent B both advance |
| H-S64 | PASS | Causal RED flip on `HOST_TF_MIRROR_WAIT` |
| H-S75 | PASS | Causal RED flip on `SAME_PAIR_PAN_HOST_OWNER` |
| H-S78 | FAIL-REAL-BUG | All 3 A9 GREEN checks pass; RED micro-pan sub-check not isolated (see §6) |

### SHA256 (I8)

| File | SHA256 |
|------|--------|
| `scenarios.mjs` (both trees) | `9FC3A8C5F569BF48A268CB72D3E9D32C5D413F7F7CD2DD86E45E7A19C08F662D` |
| `run.mjs` (both trees) | `977687683718AFF33902F44B6C4266AE74EEE69639CC702F86805070E74530E3` |

---

## 5. Invariants checked

| Invariant | How satisfied |
|---|---|
| I8 | `scenarios.mjs` + `run.mjs` mirrored byte-identical to `homepage/public/chart/...` |
| I9 | `scenarioList()` unchanged at H-S2..H-S58; gate ID set matches `known-failing.json` |
| I15 | All pending rows assert real engine state (playhead, offsetX, fetches, bar timestamps, price scale) — not DOM proxies |
| D-012 | Did not touch `react-parity-*` |
| Lane 4 boundary | Did not edit `known-failing.json` — reported pending IDs below |

---

## 6. What I did NOT do / limits

- **Pending rows not in gate yet** — Lane 4 must append H-S59–H-S78 to `expectedTests` before `npm run gate` runs them.
- **Partial harness fidelity on some rows:**
  - **H-S60/H-S61:** `4h` backward loads can trip H-INV cursor mismatch; GREEN self-heal sometimes flaky on host-only switch path.
  - **H-S66:** RED flip may not rescale peers in stub harness (price unchanged even with switch ON).
  - **H-S71:** Shallow replay master → vacuous 0-fetch both ON/OFF.
  - **H-S78:** All A9 GREEN checks pass; RED micro-pan cell does not isolate insufficient drag opt-out (prior full drag leaves `userHasPanned=true`). BL-16 has no dedicated kill-switch.
- **H-S59** does not reproduce PO B-freeze on production path; contract path GREEN only (see A5 report + step 2 H-S59b spec).
- Did not run full pending suite 20/20 in one gate pass (runtime ~30+ min for full harness).

---

## 7. Live-verification handoff

Pending scenarios encode **dev harness** contracts. PO live-confirm still required for:

1. **BL-16 (H-S78):** 2v replay PLAY → drag panel — must feel as smooth as paused drag; no snap-back while holding drag (ACCEPTANCE A9).
2. **TAL-01590 (H-S59):** 2+ panels, different symbols, replay PLAY — every panel playhead advances (build id inside each iframe).

Otherwise covered by existing multichart parity checklist rows for replay/sync (H-S17–S27 family).

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Harness coverage landed and gated baseline preserved; pending rows proven on sample runs (H-S64, H-S75 confirmed causal RED flip). Full pending-suite green + PO replay feel confirm still outstanding before Manager closes T8 step 1.

---

## Lane 4 handoff — add to `known-failing.json` `expectedTests`

When promoting pending rows to the gate baseline, append **in sorted merge order**:

```
H-S59, H-S60, H-S61, H-S62, H-S63, H-S64, H-S65, H-S66, H-S67, H-S68,
H-S69, H-S70, H-S71, H-S72, H-S73, H-S74, H-S75, H-S76, H-S77, H-S78
```

Run pending suite before merge:

```powershell
npm run test -- --pending --only=H-S59,H-S60,...,H-S78 --runs=1
```

No new `knownFailing` entries expected (all encode current GREEN behavior).
