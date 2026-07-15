# T8 step 2 — mirror-policy table design (A5-first)

**Date:** 2026-07-15  
**Directive:** D-013 ruling 1 step 2  
**Lane:** 2 (read-only design)

---

## 1. Task + RC

| Field | Value |
|---|---|
| Task id | T8 step 2 — mirror-policy table design |
| Goal | Produce `T8-MIRROR-POLICY-TABLE.md`: full adopt-data/X/Y matrix from current guards; A5/TAL-01590 independent×playing cells FIRST; map intake rows; flag escalations |
| RC | RC-8 — structural root (~20 scattered guards compensating over-fused replay mirror frame) |

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `docs/tickets-overhaul/T8-MIRROR-POLICY-TABLE.md` | **Primary deliverable** — full policy matrix, A5-first §1, intake map §3, escalation list §4, harness cross-ref §5 |

**No product or harness code edits** (step 1 owns scenarios). Did not touch `react-parity-lib.mjs` or `known-failing.json`.

---

## 3. Kill-switch (I3 + I13)

N/A — read-only design doc. Documents **existing** kill-switches as the current policy spec; proposes (not implements) `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` for the TAL-01590 escalation cell.

---

## 4. Proof — RED → GREEN

### Deliverable

Full table: `docs/tickets-overhaul/T8-MIRROR-POLICY-TABLE.md`

### A5 / TAL-01590 trace summary (P1 — mandatory first input)

**Mechanism:** Host play loop → `__multichartManagerBroadcastReplay` → per-iframe `applyReplayFrame`. BL-10 play-advance (`scheduleCoalescedSeek` during `isPlaying`) is gated inside `isSameSymbolAsHost(ch)` at `panel-cmd-bridge.js:701`. Independent panels (`!isSameSymbolAsHost`) take `applyMultichartMirrorFrame` + async `scheduleMirrorCatchUp` only (`:826–840`). `replayTick` dropped during play (`:3116–3118`). Catch-up circuit breaker (`:1135–1143`) can show furthest-loaded candle only → **visible freeze**.

**Policy cell (CURRENT):**

| Relation | Replay | adopt-data | adopt-X | adopt-Y |
|----------|--------|------------|---------|---------|
| independent | playing | **P** (async catch-up; freeze risk) | **N** (no BL-10 cell) | Y (independent) |

**Shipped behavior ≠ PO expectation** → D-013 ruling-3 escalation (not silent correction).

### RED scenario spec (hand to step 1 / Lane 4 — NOT implemented in step 2)

| Field | Spec |
|-------|------|
| Proposed id | `H-S59b` (or tighten H-S59 after baseline sync) |
| Setup | 2v+; ≥2 distinct symbols; sync OFF; replay paused |
| Actuation | Production-faithful PLAY: `replayPlay` + tick-animation frames (`animatedCandle`, `tickProgress`); **no** synthetic-only `hostReplaySeek` in inner loop |
| Measure | Per iframe: `replayTs` delta > 0 over N frames; forming `lastBarT` advances; no panel frozen while others move |
| RED | Independent panel `replayTs` delta = 0 while host advances |
| Proposed fix switch | `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` (post-Director approval) |

Existing **H-S59** (step 1 pending): contract path GREEN with `hostReplaySeek`; does not reproduce PO B-freeze.

### Intake row → cell map

| Ticket | Cell(s) | Current policy explains? |
|--------|---------|--------------------------|
| TAL-01560 | independent×playing adopt-data **P** | Partial — catch-up lag |
| TAL-01562 | host-switch B-FIX-F/G cells | Partial |
| TAL-01563 | same-TF×playing adopt-X (BL-13 cadence) | Yes (intentional coarse cadence) |
| TAL-01573 | rescale → adopt-Y scope | Partial — RC-2 cross-cut |
| TAL-01575 | replay-off→paused adopt-X | Partial — boot/replay-enter |
| TAL-01577 | coarse×paused BL-14/17 seam | Partial |
| TAL-01578 | playing×drag adopt-X | Unknown outside replay → T3 |
| TAL-01579 | release snap-back vs index pin | Gap — prepend compensation |
| TAL-01590 | **independent×playing** | **No — escalation** |

### Escalation candidates (D-013 ruling 3)

1. **independent × playing** — no BL-10 equivalent; TAL-01590 evidence  
2. **playing × drag × adopt-X** — BL-16 lead (a) follow re-engage mid-drag; TAL-01578  
3. **paused × rapid host-switch** — B-FIX-F/G/H interaction races; TAL-01562  
4. **release snap-back** — index pin vs drag delta; TAL-01579  
5. **coarse × playing × range-sync ON** — peer isolation vs follow disagreement — needs Director cell ruling

### Cells needing Director approval

- Independent × playing — correct policy likely Y/Y on own master; shipped P/N  
- BL-16 cause split — (a) X-viewport vs (b) Y autoscale — one fix per confirmed cause (D-043)

---

## 5. Invariants checked

| Invariant | How satisfied |
|---|---|
| D-013 step 2 | Read-only; table documents CURRENT behavior only |
| Zero behavior change | Deviations listed as escalations, not edits |
| A5-first | §1 of table completed before rest of matrix |
| I8 | Trace cites `homepage/public/chart/modules/` paths (byte-identical to chart tree) |

---

## 6. What I did NOT do / limits

- Did not implement policy function or `__TALARIA_DISABLE_MIRROR_POLICY_V2`.
- Did not implement H-S59b production-faithful RED scenario (spec only).
- Matrix is guard-extracted, not PO-live-validated — some cells marked Partial/Unknown.
- Did not enumerate every guard line in engine (~20+); table covers primary replay/mirror path guards cited in plan-1 journey §7.

---

## 7. Live-verification handoff

**PO / Manager before T8 migration:**

1. Read `T8-MIRROR-POLICY-TABLE.md` §1 + §4 escalations.
2. On staging build (host + iframe build ids): reproduce TAL-01590 — 2+ independent symbols, replay PLAY, confirm which panels freeze.
3. Confirm BL-16 drag feel (A9) on same build.
4. Director rules on **independent×playing** cell — approve proposed PLAY advance policy before implementation.

---

## 8. Status

**DIAGNOSTIC-ONLY** — policy table delivered; TAL-01590 freeze cell documented as escalation; migration blocked until Director approves table (D-013 ruling 3).
