# T8 step 14 — H-S25 eased-follow seam diagnostic under finest-TF cadence

## 1. Task + RC

- **Task:** `T8-step14-lane2-eased-follow-seam-diagnostic.md` — read-only re-check of **H-S25** (same-TF eased-follow seam, `maxStepDeviceDelta==candleSpacing` at bar boundaries) under finest-TF cadence A/B after T8 step 13 (staging **20260715b1**).
- **RC:** **Tooling/diagnostic — no RC discharged.** Informs **RC3-HS25#1** (T8 replay-follow family); fix deferred until PO confirms b1.

---

## 2. What I changed — file by file

**No product or harness edits.** Read-only diagnostic only.

| File | Change |
|------|--------|
| `docs/tickets-overhaul/worker-reports/T8-step14-eased-follow-seam-diagnostic-report.md` | This report (deliverable). |

**Explicit:** `known-failing.json`, `scenarios.mjs`, `panel-cmd-bridge.js`, `replay-system.js`, `chart.js` — **NOT touched.**

---

## 3. Kill-switch (I3 + I13)

### Cadence switch under test (step 13)

| Switch | Default | OFF behavior |
|--------|---------|--------------|
| `window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` | unset (**fix ON**) | Coarse selected-TF play stepping (pre–step-13) |

### H-S25 / Fix A context (not toggled this step)

| Switch | Default | OFF behavior |
|--------|---------|--------------|
| `window.__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW` | unset (**fix ON**) | Bar-quantized `getReplayAutoScrollState` follow in `forceSamePairParentDataMirror`; `_mcPlayFollowRenders` stays 0 |

**A/B method:** harness `--bug --bugSwitches=__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` vs default (cadence ON). Fix A switch left at default ON for both arms.

---

## 4. Proof — RED → GREEN

### Commands (harness fast loop)

```text
cd "chart v 1.4/chart/multichart-prod/harness"

# Cadence ON (default)
node run.mjs --only=H-S25 --runs=3

# Cadence OFF
node run.mjs --only=H-S25 --runs=3 --bug --bugSwitches=__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE
```

**Build id:** harness `serve.mjs` serves **20260715b1** (step 13 staging). Harness boots source modules directly (not `dist-v9` iframe build); cadence + Fix A code paths are the step-13 tree under test.

### A/B results — `maxStepDeviceDelta` (CORE 2)

| Arm | Run 1 | Run 2 | Run 3 | Classification |
|-----|-------|-------|-------|----------------|
| **Cadence ON** | 7.002 px | 7.002 px | 7.002 px | **FAIL-REAL-BUG** (0/3) |
| **Cadence OFF** | 7.002 px | 7.002 px | 7.002 px | **FAIL-REAL-BUG** (0/3) |

`candleSpacingDevicePx = 7.002` (1m, dpr=1) in all runs. **A/B identical** — finest-TF cadence does **not** reduce or eliminate the seam leap.

### Full per-run metrics

**Cadence ON**

| Run | changedFraction | maxStepDeviceDelta | meanChanged | followRendersDelta | CORE checks |
|-----|---------------|-------------------|-------------|-------------------|-------------|
| 1 | 0.487 | 7.002 px | 3.575 px | 81 | CORE1 FAIL, CORE2 FAIL, CORE3 PASS |
| 2 | 0.436 | 7.002 px | 3.336 px | 85 | CORE1 FAIL, CORE2 FAIL, CORE3 PASS |
| 3 | 0.487 | 7.002 px | 3.022 px | 83 | CORE1 FAIL, CORE2 FAIL, CORE3 PASS |

**Cadence OFF**

| Run | changedFraction | maxStepDeviceDelta | meanChanged | followRendersDelta | CORE checks |
|-----|---------------|-------------------|-------------|-------------------|-------------|
| 1 | 0.385 | 7.002 px | 3.174 px | 84 | CORE1 FAIL, CORE2 FAIL, CORE3 PASS |
| 2 | 0.487 | 7.002 px | 2.211 px | 84 | CORE1 FAIL, CORE2 FAIL, CORE3 PASS |
| 3 | 0.615 | 7.002 px | 3.093 px | 81 | CORE1 PASS, CORE2 FAIL, CORE3 PASS |

**Pre–step-13 baseline (registry / T5 step 3):** `maxStepDeviceDelta==7.002px`, `changedFraction≈0.49`, 0/3 FAIL-REAL-BUG — **unchanged after step 13.**

### Verdict: cadence beneficiary?

**No.** Finest-TF cadence is **not** a beneficiary for H-S25.

**Why A/B is flat:** H-S25 drives **synthetic sub-candle `replayFrame` seeks** (`streamSubCandlePlaySampling` in `scenarios.mjs`) — not production `animateTick` / finest-TF subdivisions. Cadence changes host tick stepping and parity pins on live play; this scenario already advances fractional timestamps frame-by-frame. The residual defect is in the **same-TF mirror + eased-follow seam** path (`forceSamePairParentDataMirror` → `_panelPlayFollowContinuousOffsetX`), independent of cadence.

### Partial Fix A state (context)

Fix A is **partially active** (default ON): `followRendersDelta > 0` all runs; `changedFraction` often ~0.44–0.49 (sub-candle motion within bars) but **not** consistently > 0.60. The **bar-boundary** step still leaps exactly one `candleSpacing` (7.002 px) — the tracked RED signature.

**I15:** Real harness actuation — `hostReplaySeek` + `broadcastCmd('replayFrame', {isPlaying:true})` on live iframe panels; samples real `ch.offsetX` and `_mcPlayFollowRenders` (not DOM proxy). Deterministic 0/3 FAIL-REAL-BUG on CORE2.

### Gate

Not run (diagnostic scope). H-S25 remains in `known-failing.json` (Lane 4 owns edits).

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| **I3** (kill-switch) | Cadence A/B exercised via harness `--bugSwitches`; no code changes. |
| **I9** (honest gate) | Did not edit `known-failing.json`; reported stable FAIL-REAL-BUG for Lane 4. |
| **I13** (ungatable paths) | N/A — diagnostic only. |
| **I15** (no proxy greens) | H-S25 measures real offsetX + follow-render counter after real replayFrame bus. |
| **D-010** (label to evidence) | Status **DIAGNOSTIC-ONLY** — no fix attempted. |
| **Lane 1** (`chart.js`) | Not touched. |

---

## 6. What I did NOT do / limits

- **No product implementation** — per step 14 guardrail (await PO b1 A/B).
- **Did not edit** `known-failing.json`, `PER-BUG-REGISTRY.csv`, or scenarios.
- **Did not run** full `npm run gate`, PO live confirm, or `HS25_DUMP=1` seam trace (optional; leap magnitude already pins to `candleSpacing`).
- **Did not re-run** Fix A RED arm (`__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW`) — prior evidence: full bar-quantized leaps, `followRenders=0`.
- **Did not run** built `dist-v9` iframe PO path — harness-only proof.
- **Cadence OFF run 3** passed CORE1 (`changedFraction=0.615`) but still failed CORE2 — seam leap is the blocking defect, not intermittent vacuity.

---

## 7. Live-verification handoff

After PO accepts **20260715b1** and a seam fix is authorized:

1. Multichart 2×2, **all sync OFF**, host + panel B both **1m**, same pair.
2. Enter paused replay; press play.
3. Watch panel B viewport during play: motion should scroll **sub-candle smooth** (~1 device px per visible step); **no visible X-jump** of one full candle width at each 1m bar close.
4. Known RED today: occasional full-width snap at bar seams despite overall forward motion.

Parity checklist: no new row required until a fix lands; this step only confirms cadence did not green H-S25.

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

---

## Residual seam — root mechanism (for authorized follow-up)

**Site:** `panel-cmd-bridge.js` `forceSamePairParentDataMirror` post-mirror play follow (~L1452–1494) calling `_panelPlayFollowContinuousOffsetX` (~L1802–1829).

**Observed behavior:** Within each 1m bar, eased follow advances offset sub-candle (`changedFraction≈0.44–0.62`, `followRendersDelta≈80+`). At each **bar seam** (new bar appended to `ch.data`, `lastBarT` advances), the sampled per-step delta hits **exactly `candleSpacingDevicePx` (7.002 px)** — consistent with a **quantized index/pixel discontinuity** when `frac` resets against the new trailing bar while `applyMultichartMirrorFrame` has already committed the mirror’s bar-quantized viewport.

**Not caused by:** finest-TF cadence (A/B flat); H-S73 prepend compensation (see below).

---

## Fix PLAN (do NOT implement until PO confirms b1 + Manager authorizes)

### Goal

Make `_panelPlayFollowContinuousOffsetX` **monotonic across bar seams** on the same-TF `forceSamePairParentDataMirror` success path so `maxStepDeviceDelta ≤ 2.5` and `changedFraction > 0.6` under H-S25.

### Proposed mechanism (Fix A2 — seam continuity)

1. **At bar boundary substep** (when `replayTimestamp` crosses into a new bar but eased offset should continue from the prior bar’s `frac→1` endpoint):
   - Compute eased target using **seam-continuous** math: either derive `frac` against the **exiting** bar’s open time for the boundary frame, or carry `_mcPlayFollowAppliedOffsetX` across the index advance and only step ~1 device px from that baseline (same coalesce rules).
2. **After successful `applyMultichartMirrorFrame`**, ensure the eased override **wins** over any mirror-internal quantized `offsetX` before paint/sample — today the override runs, but `q`/`lastBarT`/`frac` reset still produces a one-spacing leap in the **sampled** series.
3. **Do not** change paused / range-synced / coarser / finer / independent paths (same gates as Fix A: `followPlayhead && !rangeSyncOn && same-TF call site`).

### Files

| File | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | `_panelPlayFollowContinuousOffsetX` seam continuity; optional small helper for bar-exit `frac`; post-mirror eased apply in `forceSamePairParentDataMirror` |
| `homepage/public/chart/multichart-prod/panel-cmd-bridge.js` | I8 mirror (byte-identical) |

`replay-system.js` / finest-TF cadence — **out of scope** (proven non-beneficiary for H-S25).

### Kill-switch

**Preferred:** extend existing Fix A switch so RED proof stays one knob:

- `window.__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW` — OFF reverts to bar-quantized leaps (existing H-S25 RED cell).

**Alternative** (if seam fix must be separable from Fix A): `window.__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_SEAM_CONTINUITY` (default ON = seam fix ON).

### RED → GREEN proof (future step)

```text
node run.mjs --only=H-S25 --runs=3
→ PASS×3: changedFraction>0.6, maxStepDeviceDelta≤2.5, followRendersDelta>0

node run.mjs --only=H-S25 --runs=3 --bug --bugSwitches=__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW
→ FAIL×3: maxStepDeviceDelta==candleSpacing, followRendersDelta==0
```

Fence: H-S19, H-S19b, H-S83 must stay PASS; H-S73 cell unchanged.

### Lane 4 handoff

- H-S25 stays **tracked-red** in `known-failing.json`.
- Update **RC3-HS25#1** reason: “Fix A partial — sub-candle motion OK, bar-seam leap residual; **not** fixed by finest-TF cadence (step 14).”
- **Not** a cadence beneficiary — no re-baseline for cadence acceptance alone.

---

## H-S73 / B-FIX-C interaction note

| | **H-S25** (this step) | **H-S73** (B-FIX-C) |
|--|----------------------|---------------------|
| **Policy cell** | Same-TF play eased follow | Mirror prepend offsetX compensation |
| **Replay mode** | PLAY, forward sub-candle frames | Paused, host backward left-load |
| **Switch** | `__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW` | `__TALARIA_MC_DISABLE_MIRROR_PREPEND_COMPENSATION` |
| **Code branch** | `forceSamePairParentDataMirror` → `followPlayhead` → eased path | `mirrorPrependCompensation` → **skips** eased follow (`if (mirrorPrependCompensation)` at ~L1436) |

**Shared shell:** both live in `forceSamePairParentDataMirror` and touch `ch.offsetX`, but **orthogonal triggers**. H-S25 does not exercise prepend compensation (forward-only play, no host backward pan). A seam-continuity fix in `_panelPlayFollowContinuousOffsetX` / eased apply should **not** alter H-S73’s prepend branch if gated to `followPlayhead && !mirrorPrependCompensation` (existing structure). Re-run H-S73 after any seam fix as fence only.
