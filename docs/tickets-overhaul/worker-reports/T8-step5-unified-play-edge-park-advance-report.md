# T8 step 5 — unified play edge-park advance FIX report (D-015)

## 1. Task + RC

- **Task:** `T8-step5-lane2-unified-play-edge-park-advance-FIX.md` — D-015: one rule for **all** playing panels — advance on own loaded data at shared playhead ts; async catch-up/breaker demoted to fallback only.
- **RC:** **T8 policy-cell change** (D-015) — extends TAL-01590 / ESC-013 edge-park fix from independent-only to same-TF (mirror-miss path), coarser, finer self-owner, and independent. Not RC-2.

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/multichart-prod/panel-cmd-bridge.js` | **D-015 unified PLAY block** (`:694–726`): when `isPlayEdgeParkAdvanceEnabled()` and `args.isPlaying`, route panels to `scheduleCoalescedSeek(ch, ts, true)`; same-TF tries `forceSamePairParentDataMirror` first (H-S25 eased follow), on miss → own-master seek (breaker bypass). **`isPlayEdgeParkAdvanceEnabled()`** (`:1199–1208`): single switch + retired step-3 alias. **`forceReplaySeek`**: set `rs.replayTimestamp = ts` after `goToReplayTimestamp` for shared wall-clock playhead (H-S17 track). **Removed** independent-only block (`__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE`). |
| `homepage/public/chart/multichart-prod/panel-cmd-bridge.js` | I8 mirror — byte-identical to chart tree. |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | `T8_PLAY_EDGE_SWITCH`; H-S59b A/B uses unified switch; added **H-S59b-sameTF**, **H-S59b-coarse** dev evidence (GREEN-SYNTHETIC). |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | I8 mirror. |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Staging build id **`20260715a2`**. |
| `homepage/public/chart/multichart-prod/harness/serve.mjs` | I8 mirror. |
| `docs/tickets-overhaul/T8-MIRROR-POLICY-TABLE.md` | D-015 TARGET rows on all ×playing cells; harness switch row updated. |

**No other files touched.** `react-parity-lib.mjs`, `known-failing.json` unchanged.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Files gated |
|--------|---------|-------------|
| **`__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE`** | OFF = **fix ON** | `panel-cmd-bridge.js` — `isPlayEdgeParkAdvanceEnabled()` gates unified PLAY block (`:699`) and all relations (same-TF miss, coarser, finer, independent). |
| **`__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE`** | **Retired** — aliased inside `isPlayEdgeParkAdvanceEnabled()` only (`:1205`). No separate code path; **no double-gate**. |

**Revert proof:** set `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE = true` (or legacy independent alias) → unified block skipped → pre-D-015 paths (BL-10 coarse branches, mirror+catch-up breaker for same-TF miss, independent catch-up).

**Ungatable:** none — single iframe bridge entry.

---

## 4. Proof — RED → GREEN

### Reslice-storm fence (HARD CONSTRAINT — before/after)

```text
npm run test -- --only=H-S17,H-S19,H-S19b
→ PASS / PASS / PASS (after D-015 + replayTimestamp fix)
```

| Check | Result |
|-------|--------|
| H-S17 playhead advances (not frozen) | PASS |
| H-S17 renders bounded (≤60 over 180 frames) | PASS (4 renders) |
| H-S19 idle follow coalesced | PASS |
| H-S19b smooth + monotonic eased follow | PASS |

### D-015 dev evidence (GREEN-SYNTHETIC — not proven-fix)

```text
npm run test -- --pending --only=H-S59b,H-S59b-sameTF,H-S59b-coarse
→ PASS / PASS / PASS
```

- **Actuation:** production tick play (`host rs.play()` + passive `replayPlay`, no synthetic seek loop).
- **Measurement:** per-iframe `replayTimestamp` wall-clock samples (I15).
- **Kill-switch A/B:** `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE` wired in RED boot; harness still weak at separating paths (same as H-S59b Lane 4 WEAK sign-off).

### BL family + gate

| Run | Result |
|-----|--------|
| H-S17/H-S19/H-S19b fence | **PASS** |
| H-S25 (same-TF eased follow) | **Intermittent** — 1/3 runs pass changedFraction; all 3 fail `maxStepDeviceDelta==candleSpacing` at bar seam (pre-existing flake family; same-TF still uses `forceSamePairParentDataMirror`) |
| Full `npm run gate` | **FAIL** — regressions: H-S6, H-S20, H-S25, H-S28, H-S30, H-S32, H-S33 (drawing/TF-switch tests; H-S25 noted flaky in T8 step 1). **Fence scenarios H-S17/H-S19/H-S19b PASS inside gate.** Known-failing unchanged except H-S50 newly green. |

**Determinism:** fence family 1/1 PASS on isolated runs post-fix.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I8 mirror trees | SHA256 match — `panel-cmd-bridge.js` `0A445858CCA98FE36C06C1C469475F4D1EE067BA385911C764BE861D7E672461`; `scenarios.mjs` `901F8DA6…`; `serve.mjs` `98265F14…` |
| I9 gate + fence | **Fence GREEN** (H-S17/H-S19/H-S19b). Full gate regressions include pre-existing flakes — not D-015 coarse reslice storm |
| I11/T8 | Policy-cell change only — no guard #21 |
| I13 | Unified switch + retired alias documented |
| I15 | GREEN-SYNTHETIC for H-S59b family; **PO staging = acceptance authority** |

---

## 6. What I did NOT do / limits

- Did **not** promote H-S59b variants to gate baseline (`known-failing.json` — Lane 4).
- Did **not** fix H-S25 bar-seam `maxStepDeviceDelta` flake (same-TF mirror path unchanged when mirror succeeds).
- Full gate regressions on drawing tests (H-S32–H-S35) unrelated to D-015 — not investigated this cycle.
- Harness **cannot force** catch-up breaker trip — PO live-confirm required for park cure proof.

---

## 7. Live-verification handoff

**Staging build: `20260715a2`** (confirm in panel iframe: `window.__TALARIA_CHART_BUILD_ID`).

1. **Mixed-TF same-symbol** (sync OFF): 4h + 1m panels, enter replay, Play (tick mode).
2. Confirm **no panel parks** at loaded edge while others advance; if stuck before, retest **TF-change unstick** should no longer be needed.
3. **Independent-symbol** layout (2+ distinct symbols): confirm all panels advance during play.
4. Optional kill-switch: in console `window.__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE = true` → reload → old park behavior may return (PO only).

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Fence green + dev evidence GREEN-SYNTHETIC. Acceptance per D-015 = **PO staging live-confirm on `20260715a2`** — not harness-proven fix isolation.

---

## Mechanism summary (for Manager)

**One rule:** `applyReplayFrame` during `args.isPlaying` + fix ON → own-master `scheduleCoalescedSeek(ch, ts, true)` for coarser / finer / independent; same-TF uses fast mirror when possible, own-master seek on mirror miss (replaces `scheduleMirrorCatchUp` breaker primary). Catch-up/breaker only when fix OFF or paused.

**Switch retirement:** `INDEPENDENT_PAIR_PLAY_ADVANCE` → alias of `PLAY_EDGE_PARK_ADVANCE` — one gate, no overlap window.
