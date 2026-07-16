# T0 step 17 — close loose items + honest reactParity RED audit

**Date:** 2026-07-15  
**Lane:** 4 (sole `known-failing.json` / scenario-id / react-parity owner)  
**Build:** `20260715b1` (react parity); host harness stub

---

## 1. Task + RC

**Task:** `T0-step17-lane4-close-loose-items-plus-red-audit.md` — fix H-S40/H-S41 probe honesty, confirm H-S58/H-S83 registration, route H-S30/H-S73, audit 12 reactParity REDs, restore gate.

**RC:** Tooling/diagnostic — RC-3 probe fidelity (I15); RC-1/RC-4 re-migration acceptance baseline (reactParity audit).

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | **H-S40/41 probe fix:** `readAnchorSnapshot` reads `drawing.timestampPoints[i].timestamp/price` (not `data[round(x)].t`); `assertAnchorTimestampsStable` requires `hasTimestampPoints`. **H-S83:** `refreshFinestReplayCadence()` after switch-OFF leg (fixes vacuous A/B cell). **H-S82:** already implemented in tree (D-017 pan-snapback) — registered in baseline. SHA256: `5D272AD3B0BCED087E3DA59E418CF28F5468500B0EC065C0B177A0528248E81D` |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | I8 mirror (byte-identical). |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Promoted **H-S40/H-S41** (honest probe green); added **H-S82/H-S83** to `expectedTests`; new `expectedPendingPO.H-S83`; routed **H-S30** → T8/replay, **H-S73** → T8/RC-3; reactParity: registered **H-S80**, promoted **H-R07/H-R12** greens on b1. **83 expected / 32 knownFailing / 10 react knownFailing.** SHA256: `3AC5627753F0C309E60D74579AC5C4877D5D0FDB8BE23FD19C0595AAFEAE84B5` |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | I8 mirror. |
| `docs/tickets-overhaul/TICKET-REGISTRY.csv` | TAL-01582 → `fixed_pending_live` (H-S83 harness GREEN; PO A/B pending). |
| `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` | Added `D016-HS83#1` (`expected-pending-PO`). |
| Evidence logs | `step17-hs40-41-42-x3.txt`, `step17-hs58-hs83.txt`, `step17-hs83-x3.txt`, `step17-hs82.txt`, `step17-gate-react-pass.txt`, `step17-gate-pass2.txt` |

**No product engine / React / `panel-cmd-bridge.js` edits.**

---

## 3. Kill-switch (I3 + I13)

| Switch | Scenario | Default |
|--------|----------|---------|
| `__TALARIA_RC3_VOLUME_RENDER_RESOLVE` | H-S40/41/42 anchor probe surface | ON — Phase 1 committed |
| `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` | H-S83 switch-OFF A/B leg | ON (cadence fix); OFF proves 14.4M coarse jumps |
| `__TALARIA_MC_DISABLE_PAN_RELEASE_ANCHOR_HOLD` | H-S82 RED leg | ON (D-017 fix); OFF proves stale grab baseline |

N/A for reactParity audit (read-only classification).

---

## 4. Proof — RED → GREEN

### Item 1 — H-S40 / H-S41 probe honesty (I15)

**Fix:** probe now asserts `timestampPoints` timestamps (source tagged in failure detail), not 60s bar-open drift.

```powershell
npm run test -- --only=H-S40,H-S41,H-S42 --runs=3
```

| Id | Before (dishonest probe) | After (honest probe) | Verdict |
|----|--------------------------|----------------------|---------|
| **H-S40** | FAIL 3/3 (`beforeT≠afterT` 60s bar-open) | **PASS 3/3** (`timestampPoints` stable) | **Promoted** — Lane 1 Phase-1 `__TALARIA_RC3_VOLUME_RENDER_RESOLVE` genuinely green |
| **H-S41** | FAIL 3/3 (same probe bug) | **PASS 3/3** | **Promoted** — same |
| **H-S42** | Already green step 15 | **PASS 3/3** | Confirmed |

Evidence: `step17-hs40-41-42-x3.txt` — all anchors show `timestampSource=timestampPoints`.

### Item 2 — H-S58 registration

- **In `scenarioList()` + `expectedTests`:** yes (since T4 step 8).
- **Isolated:** `RESULT H-S58 PASS` (3 internal loops + switch-OFF RED leg).
- Evidence: `step17-hs58-hs83.txt`

### Item 3 — H-S83 expected-pending-PO

- **`expectedTests`:** added H-S83 (82→83 host scenarios).
- **`expectedPendingPO.H-S83`:** harness GREEN; hard-green withheld until PO accepts staging b1 A/B.
- **`TICKET-REGISTRY`:** TAL-01582 → `fixed_pending_live`.
- **`PER-BUG-REGISTRY`:** `D016-HS83#1` (`expected-pending-PO`).
- **Harness:** 3/3 PASS after switch-OFF `refreshFinestReplayCadence()` fix.
- Evidence: `step17-hs83-x3.txt`

### Item 4 — H-S30 / H-S73 routing

| Id | Route | Baseline reason (updated) |
|----|-------|---------------------------|
| **H-S30** | **T8/replay** | FAIL-REAL-BUG 0/3 — host step-forward-spam peer self-fetch (§6cs) |
| **H-S73** | **T8/RC-3** | FAIL-REAL-BUG B-FIX-C prepend compensation — **NOT** TAL-01579 (H-S82) |

### Item 5 — reactParity honest-RED audit (build `20260715b1`)

`npm run gate:react` → **`[react-gate] PASS: 10 known-failing tracked`** (promoted H-R07, H-R12 greens).

| Row | Actuation (I15) | Measurement (end-state) | Verdict |
|-----|-----------------|-------------------------|---------|
| **H-R01** | `page.mouse.click` at iframe-translated hit | `isDrawingSelected` store + parent V9 bar visible | **Honest RED** — store not set after real click |
| **H-R02** | real click | `isDrawingSelected` + selection chrome border | **Honest RED** — orphan handles (`selected=false`, `hasBlueBorder=true`) |
| **H-R03** | `page.keyboard` Ctrl + real click | store multi-select both IDs | **Honest RED** — Ctrl-toggle broken |
| **H-R04** | `page.mouse` dbl-click | `waitForParentDrawingSettingsOpen` (real modal, not shell) | **Honest RED** — settings never open |
| **H-R05** | dbl-click chain + `pressEscapeReact` | store deselect + parent settings closed | **Honest RED** — setup fails (settings never open before Esc) |
| **H-R06** | `deleteSelectedViaKeyboard` | `drawingExists` false in store + repaint | **Honest RED** — drawing remains in store |
| **H-R07** | cross-panel real clicks | global single store selection + host chrome cleared | **GREEN on b1** — promoted from baseline |
| **H-R08** | `page.mouse` Ctrl+drag at iframe coords | marquee `active/w/h` + store multi-select | **Honest RED (host)**; panel-B store leg **suspect** — `dm.selected` shows host IDs leaked into panel-B frame read |
| **H-R09** | select → dbl-click → Esc chain | store + V9 + parent settings each step | **Honest RED** — chain breaks at select/settings |
| **H-R12** | panel-B select + parent `#tl-sett` gear click | `waitForParentDrawingSettingsOpen` real modal | **GREEN on b1** — promoted from baseline |
| **H-R13** | panel-B real dbl-click | parent settings open + persist 400ms | **Honest RED** — dbl-click transport broken |
| **H-R14** | panel-B Ctrl+drag marquee | marquee active + store multi-select | **Honest RED** — marquee inactive |

**Re-migration baseline:** 10 honest tracked REDs on b1 (was 12 at step 14; H-R07/H-R12 now proven green). No false RED masking a real green except **H-R08 panel-B store read** (harness isolation suspect — host IDs in panel-B `dm.selected`).

Evidence: `step17-gate-react-pass.txt`

### Manager `gate`

```powershell
npm run gate
```

**Result:** **FAIL** — not a step-17 baseline regression; **H-S18 `Maximum call stack size exceeded`** in `drawing-tools-manager.js` redraw loop poisons the shared browser session; subsequent scenarios cascade-fail (40+ false regressions). H-S40/41 pass in isolation 3/3 but fail in poisoned session.

- First run hung ~65 min at H-S19 after H-S18 stack overflow.
- Second complete run: `step17-gate-pass2.txt` — `[gate] FAIL: regression(s): H-S17, H-S18, …` (cascade).
- H-S18 isolated run **hung** (killed after 7+ min).

**Prior clean gate:** T0 step 16 `step16-gate-pass2.txt` PASS (81 expected / 34 knownFailing). Step-17 delta is promote H-S40/41 + add H-S82/83 — isolated proofs green; full gate blocked on **pre-existing H-S18 harness stability**, not probe/baseline edits.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| **I8** | Both harness trees mirrored; SHA256 match confirmed |
| **I9** | `gate:react` PASS; manager `gate` FAIL (H-S18 cascade — see §4) |
| **I15** | H-S40/41 probe fixed; reactParity audit table per row |
| **Lane 4 boundary** | Sole baseline editor; registry rows added |

---

## 6. What I did NOT do / limits

- **Manager `gate` PASS** not achieved this step — blocked on H-S18 stack-overflow / hang poisoning full-suite browser (escalate to product/harness stability).
- **H-R08 panel-B store leak** in audit — flagged suspect; did not fix harness isolation this step.
- **H-S81** still deferred (coarse tick-play fence).
- Did not edit product code for H-S18 redraw loop.

---

## 7. Live-verification handoff

1. **H-S83 / TAL-01582:** PO A/B on staging b1 — 4h-focused tick play; 1m panels sub-advance (not 4h jumps); cadence feel.
2. **H-S40/41:** PO anchored VWAP + fixed-range VP — switch 1m→5m; anchor timestamps unchanged.
3. **React re-migration:** PO confirm the 10 remaining honest REDs on built `20260715b1` (H-R01–06, H-R08–09, H-R13–14).

---

## 8. Status

| Item | Status |
|------|--------|
| **1 H-S40/41 probe** | **DONE (proven)** — honest probe; 3/3 PASS; promoted; Phase-1 RC-3 genuinely green |
| **2 H-S58** | **DONE (proven)** — registered + PASS |
| **3 H-S83 pending-PO** | **DONE (proven)** — registered expected-pending-PO; harness 3/3 PASS |
| **4 H-S30/H-S73 route** | **DONE (proven)** — reasons updated T8/replay + T8/RC-3 |
| **5 reactParity audit** | **DONE (proven)** — table above; `gate:react` PASS |
| **Manager gate** | **BLOCKED** — H-S18 stack-overflow cascade; isolated proofs green |

**Overall:** **DONE (dev only) — NEEDS-LIVE** for PO items; manager `gate` re-run blocked until H-S18 harness stability fixed.
