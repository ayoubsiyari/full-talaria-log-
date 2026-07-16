# T7 Step 1 — drawing / anchoring / invalidation closure sweep (READ-ONLY)

**Task:** T7 step 1 (Lane 1) — interim freeze-safe accounting while RC-4 re-migration (ESC-016) awaits Director authorization.  
**Type:** Read-only / registry — no product, harness, or `known-failing.json` edits.  
**Date:** 2026-07-15  
**RC:** Tooling/triage — no RC discharged; feeds Manager closure + Lane 4 scenario requests.

**Landed baseline for this sweep:**

| Track | Commit / step | Switches |
|-------|---------------|----------|
| RC-3 anchoring (5/6; Phase 5 parked) | `ce3b28d2` (+ Phase 1 `caf42f4f` in history) | `__TALARIA_RC3_VOLUME_RENDER_RESOLVE`, `__TALARIA_RC3_CLAMP_POLICY`, `__TALARIA_RC3_PASTE_TIMESTAMP_OFFSET`, `__TALARIA_RC3_FRACTIONAL_PLACE`, `__TALARIA_RC3_LABEL_ANCHOR` |
| RC-2 freeze-safe invalidation | `ce3b28d2` (manager bundled) + T2 step 1 prior | `__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2`, `__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2` |
| RC-2 multichart peer (frozen) | T2 step 3 diagnostic only | — (deferred) |

**Registry counts (PER-BUG-REGISTRY.csv):** RC-3 `user_replied` **40** rows; RC-2 `user_replied` **28** + `open` **6** (incl. TAL-01484/01490/01496 multichart).

---

## 1. Task + RC

| Field | Value |
|-------|-------|
| Task id | T7 step 1 — drawing / anchoring / invalidation closure sweep |
| Goal | Cross-check TICKET-REGISTRY + PER-BUG rows against landed RC-3 phases 1–4/6 and T2 step 4 freeze-safe items |
| RC | Diagnostic/triage only — no fix |

---

## 2. What I changed — file by file

**N/A — read-only.** No files touched.

---

## 3. Kill-switch (I3 + I13)

Disposition cites landed switches (no new switches):

| Switch | Step | Discharges (mechanism) |
|--------|------|------------------------|
| `__TALARIA_RC3_VOLUME_RENDER_RESOLVE` | T5 Phase 1 | Volume render read-only resolve (D1/D2) |
| `__TALARIA_RC3_CLAMP_POLICY` | T5 Phase 2 | `resolveAnchoredVolumeProfileRange`, data-bounds clamp |
| `__TALARIA_RC3_PASTE_TIMESTAMP_OFFSET` | T5 Phase 3 | Clipboard timestamp offset (D4) |
| `__TALARIA_RC3_FRACTIONAL_PLACE` | T5 Phase 4 | Fractional placement vs integer snap (D5/D6) |
| `__TALARIA_RC3_LABEL_ANCHOR` | T5 Phase 6 | Fib/Gann label anchor + pan hot-path |
| `__TALARIA_DISABLE_DRAWING_SAVE_INVALIDATION_V2` | T2 step 1 | Style persist → `scheduleRender` (G1) |
| `__TALARIA_DISABLE_DRAWING_LOCAL_INVALIDATION_V2` | T2 step 4 | `redrawAll` / `addDrawing` canvas invalidate (G6 partial) |

**Parked (not landed):** Phase 5 multichart parity — no switch; awaits re-migration.

---

## 4. Proof — RED → GREEN

**N/A — no new proof run.** Evidence cited from accepted worker reports + standalone probes:

| Evidence | Proves |
|----------|--------|
| `t5-step4/5/6-*-proof.mjs` | Phases 3/4/6 honest I15 probes (dev-only) |
| `t2-step4-local-invalidation-proof.mjs` | Local invalidation V2 (dev-only; not in `ce3b28d2` commit set except manager) |
| H-S38/H-S39 | T2 step 1 save invalidation GREEN (gate) |
| H-S40/H-S41/H-S42 | RC-3 volume anchor family — **tracked RED** (probe uses `round(x)`; Lane 4 honest-read fix pending) |
| H-S44 | T1 fallback-B tracked RED (not RC-3) |
| H-S50 | RC-4 peer replay repaint tracked RED |

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| P3 | Still-open / deferred rows name RC + mechanism + owning lane |
| P5 | Closed rows cite switch + step + evidence path |
| D-010 | `fixed_pending_live` vs `needs-live` distinguished from gate GREEN |
| I15 | I15-gap table flags rows without honest built-product proof |

---

## 6. What I did NOT do / limits

- Did not re-run gate, PO live, or update registry CSV status columns.
- PER-BUG rows outside drawing/anchoring/invalidation (e.g. journal, community) excluded.
- Indicator RC-3 rows (TAL-00329, 00384, etc.) listed as **out of T5 scope** — Lane 3 RC-6.
- Phase 5 (D8 multichart TF parity) explicitly **not** assessed as fixed.
- T2 step 4 `drawing-tools-ui.js` + proof script remain **uncommitted** in working tree at sweep time.

---

## 7. Live-verification handoff

PO should confirm on build containing **`ce3b28d2`** (after Manager bump; unregister SW; verify build id in host iframe).

| Family | Spot-check |
|--------|------------|
| Anchored VP/VP TF switch | 1m anchored VWAP + fixed-range VP + anchored VP → 5m; wall-clock stable |
| Paste offset | Copy tool on 1m → prepend/simulate scroll → paste; copy not stacked on prior |
| Fractional placement | Between-candle trendline → 5m; same wall-clock |
| Gann/fib labels | Pan right; level numbers stay on tool geometry |
| Style stuck-until-click | Settings color change without chart click (H-S38 class) |
| redrawAll lag | Pan/zoom; drawings not one frame behind candles |
| **Known still-open** | 2v layout zoom/reset until tap (TAL-01484); peer chart step without B click (H-S50) |

---

## 8. Status

**DIAGNOSTIC-ONLY** — closure table + I15 gaps + deferred list complete.

---

## RC-3 phase → registry closure (summary)

| Phase | Switch | Primary divergences | Registry / tickets | Status | Evidence |
|-------|--------|---------------------|-------------------|--------|----------|
| **1** volume render resolve | `__TALARIA_RC3_VOLUME_RENDER_RESOLVE` | D1, D2 | TAL-00322#11–17, TAL-00323#2/9/10/13/15 | **needs-live** | Engine fix landed; H-S40/41/42 still tracked RED (probe gap) |
| **2** clamp policy | `__TALARIA_RC3_CLAMP_POLICY` | D1 (anchored VP right edge) | TAL-00323#9 (extend-right), anchored VP family | **needs-live** | Step-3 report; no dedicated harness row |
| **3** paste timestamp | `__TALARIA_RC3_PASTE_TIMESTAMP_OFFSET` | D4 | TAL-01383#1, TAL-00253 (paste displacement) | **fixed_pending_live** | `t5-step4-paste-timestamp-proof.mjs` |
| **4** fractional place | `__TALARIA_RC3_FRACTIONAL_PLACE` | D5, D6 | TAL-00157#4, TAL-00322#12/#13 (partial) | **fixed_pending_live** | `t5-step5-fractional-place-proof.mjs`; **no H-S44 in gate** |
| **5** multichart parity | — (parked) | D8 | TAL-00157#22, H-S46 (proposed) | **deferred-to-remigration** | ESC-016 / RC-4 track |
| **6** label anchor | `__TALARIA_RC3_LABEL_ANCHOR` | label pan drift | TAL-00271#2/#9/#10, TAL-00245#8 | **fixed_pending_live** | `t5-step6-label-anchor-proof.mjs` |

---

## Closure table — RC-3 anchoring (PER-BUG rows, `user_replied`)

### A — Volume / anchored tools (Phases 1–2)

| Row | Symptom (short) | Fixed-by | Evidence | Status |
|-----|-----------------|----------|----------|--------|
| TAL-00322#11 | VWAP price/time labels broken | Phase 1+2 | H-S40 family (tracked RED) | **needs-live** — mechanism landed; gate probe not honest |
| TAL-00322#12 | Price label at click not line center | Phase 4/6 partial | No VWAP-specific probe | **still-open** (label geometry not in Phase 6 scope) |
| TAL-00322#13 | Label at line end not beginning | Phase 4/6 partial | — | **still-open** |
| TAL-00323#2 | VP snaps back after settings | Phase 1+2 resolve | — | **needs-live** |
| TAL-00323#9 | Extend-right past last candle | Phase 2 clamp | — | **needs-live** |
| TAL-00323#10 | VP label at corners not nodes | — | — | **still-open** |
| TAL-00323#13 | Cannot drag VP body | — | — | **still-open** (interaction, not anchoring) |
| TAL-00323#15 | Label at corner not fixed | Phase 6 partial | — | **still-open** |

### B — Placement / paste / magnet (Phases 3–4)

| Row | Symptom (short) | Fixed-by | Evidence | Status |
|-----|-----------------|----------|----------|--------|
| TAL-00157#4 | Click jumps to previous candle middle | Phase 4 | `t5-step5-fractional-place-proof.mjs` | **fixed_pending_live** |
| TAL-00322#4 | Tool placeable after last candle | Phase 2 clamp | — | **needs-live** |
| TAL-00117#6 | Regression channel past last candle | Phase 2 partial | — | **still-open** |

### C — Label / level anchoring (Phase 6)

| Row | Symptom (short) | Fixed-by | Evidence | Status |
|-----|-----------------|----------|----------|--------|
| TAL-00271#2 | Gann levels move on pan | Phase 6 | `t5-step6` probe | **fixed_pending_live** |
| TAL-00271#9 | Fib levels follow pan | Phase 6 | `t5-step6` probe | **fixed_pending_live** |
| TAL-00271#10 | Levels must stay at anchors | Phase 6 | `t5-step6` probe | **fixed_pending_live** |
| TAL-00245#8 | Replay: levels move on pan | Phase 6 partial | No replay harness | **needs-live** |
| TAL-00157#9 | Labels don't follow drag; crosshair stuck | — | TAL-01584 intake | **still-open** (crosshair/selection) |
| TAL-00157#11 | Crosshair through label overlay | — | — | **still-open** |
| TAL-00157#24 | Price label snaps back during replay | — | Phase 7 replay×anchor | **still-open** |
| TAL-00836#1 | Ctrl returns to previous location | — | — | **still-open** |
| TAL-00841#1 | Price label stays when dragging handle | Phase 6 partial | — | **needs-live** |

### D — Multichart / replay anchoring (Phase 5 or frozen)

| Row | Symptom (short) | Fixed-by | Evidence | Status |
|-----|-----------------|----------|----------|--------|
| TAL-00157#22 | Price mismatch multichart TF switch | — | Phase 5 parked | **deferred-to-remigration** |
| TAL-00245#10 | Tool below screen edge near replay bar | — | — | **still-open** |

### E — RC-3 rows **not** covered by Phases 1–4/6 (still-open)

| Row | Symptom (short) | Notes | Status |
|-----|-----------------|-------|--------|
| TAL-00157#2 | Price label far right | Price-label chrome | **still-open** |
| TAL-00157#7 | Box drag moves whole chart | Pan handler | **still-open** |
| TAL-00157#17 | Labels hidden until options | Visibility/settings | **still-open** |
| TAL-01127#1 | Auto rescale lock left edge | Viewport/rescale | **still-open** |
| TAL-00043#1 | Highlighter labels | Tool-specific | **still-open** |
| TAL-00054#1 | Line style (mis-tagged drag-mis-anchor) | Settings apply | **still-open** |
| TAL-00117#10 | Price label at placement not midline | Line label geometry | **still-open** |
| TAL-00156#1 | Style option needs double-click | RC-2 invalidation adjacent | **still-open** |
| TAL-00228#8 | Vertical fib levels immovable | Interaction | **still-open** |
| TAL-00228#10 | Level numbers misaligned on reposition | Fib UI | **still-open** |
| TAL-00292#1 | Apply default links line+labels | Settings | **still-open** |
| TAL-00428#1 | Labels don't work | Generic | **still-open** |
| TAL-01146#1 | White background on labels | Style | **still-open** |
| TAL-00329/00384/00391/00392/00413/00448 | Indicator price labels | RC-6 / Lane 3 | **out-of-scope** |

**Thread-level (TICKET-REGISTRY.csv):** TAL-00157, TAL-00322, TAL-00271 remain **`user_replied`** — partial phase coverage does not close threads.

---

## Closure table — RC-2 invalidation (freeze-safe + deferred)

### F — Landed (single-chart engine-local)

| Row / ticket | Symptom | Fixed-by | Evidence | Status |
|--------------|---------|----------|----------|--------|
| (family) style stuck-until-click | Color/width commit no repaint | T2 step 1 `saveDrawings` V2 | H-S38/H-S39 GREEN | **fixed_pending_live** |
| TAL-00322#3 | Moved VWAP hidden until tap | Partial — save + local V2 | H-S38 class only | **needs-live** |
| TAL-00322#17 | VWAP hides on CP2 drag | Live-handle exempt path | — | **still-open** |
| TAL-00228#3/9 | Tool invisible until interaction | Local invalidation partial | — | **needs-live** |
| M3 settings-bypass (text-align defaults) | `renderDrawing` without invalidate | T2 step 4 `notifyDrawingVisualMutation` | UI path uncommitted | **fixed_pending_live** |
| `redrawAll` SVG-only gap (G6) | Canvas stale after drawing redraw | T2 step 4 local V2 | `t2-step4-local-invalidation-proof.mjs` | **fixed_pending_live** |

### G — RC-2 `user_replied` still-open (no freeze-safe fix)

| Row | Symptom | Mechanism guess | Status |
|-----|---------|-----------------|--------|
| TAL-00157#3/#6/#8/#14/#15/#20/#21 | Render/pan glitches | chart.js render layers | **still-open** (chart.js frozen) |
| TAL-00117#3 | Middle line hide toggle | visibility + invalidate | **still-open** |
| TAL-00271#5/#8 | Gann visibility / apply-default labels | visibility path | **still-open** |
| TAL-00322#9/#14 | Pan slow / TF visibility | performance + lifecycle | **still-open** |
| TAL-00281/00285/00289/00296 | Style menu stuck / glitches | UI overlay | **still-open** |
| TAL-00245#4/#5/#7 | Replay visibility | replay×render | **still-open** |
| TAL-01097#1 | Replay tick speed stuck | replay cadence | **still-open** (T8) |

### H — Deferred to RC-4 re-migration (multichart / iframe / chart.js)

| Item | Tickets / harness | Owner track | Status |
|------|-------------------|-------------|--------|
| **T2-3a** peer drawing sync invalidation | TAL-01484, TAL-01490; G2/G3/G6 | `chart.js` `receiveDrawingChange`, `sync-bridge.js` | **deferred-to-remigration** |
| **T2-3b** replay peer invalidation | H-S50; G4 | `replay-system.js`, `panel-cmd-bridge.js` | **deferred-to-remigration** |
| **T2-3c** assertion on chart.js + sync | G7 | chart.js | **deferred-to-remigration** |
| **T2-3d** React SVG-only paths | G5 | `TalariaV8bLive.jsx` | **deferred-to-remigration** |
| **TAL-01573** manual rescale full re-render | TAL-01573 | `chart.js` `calculateScales` scope | **deferred-to-remigration** |
| **H-S38-B / H-S39-B** (proposed) | Panel B style commit repaint | multichart peer | **deferred-to-remigration** |
| **H-S33-peer** (proposed) | Delete sync ghost on B | peer remove path | **deferred-to-remigration** |
| **T2-2 axis A1** | TAL-01565, TAL-01583 | chart.js tick/label | **deferred** (separate T2 step 2) |

**TICKET-REGISTRY.csv open RC-2 multichart:** TAL-01484, TAL-01490, TAL-01488, TAL-01489, TAL-01496, TAL-01573 → all **deferred-to-remigration** except PO retest notes.

---

## I15-gap flags — looks discharged but lacks honest proof

| Row / claim | Why it looks fixed | Gap | Lane 4 request |
|-------------|-------------------|-----|----------------|
| TAL-00322#11–17 (volume anchor family) | Phase 1+2 landed | H-S40/41/42 probe reads `data[round(x)].t` not `timestampPoints` | **H-S40/41/42 honest read** (timestampPoints); remove H-S42 from knownFailing when GREEN |
| TAL-00157#4 | Phase 4 report | No gate scenario; proposed H-S44 not authored | **H-S44** fractional placement TF switch |
| TAL-00271#9/#10 | Phase 6 dev probe | Gann fan labels clipped OOB in harness; no built-product proof | **H-S45** or extend H-S38 pattern to Gann level pan |
| TAL-01383#1 | Phase 3 probe | Paste proof synthetic; no multichart clipboard I14 | **H-S43** panel-B paste after prepend |
| Phase 2 clamp (anchored VP right edge) | Code path only | No RED→GREEN harness row | **RC3-AVP-RIGHT** property or H-S42 variant |
| T2 local invalidation | `t2-step4` probe | Measures `_mcDiag.renders` on host only; UI path uncommitted | Keep probe; add settings **Apply-default** actuation row |
| TAL-00322#3 (VWAP hidden until tap) | Overlaps invalidation | May be live-handle exempt not save path | Distinguish with H-S38-style drag probe |

---

## Deferred-to-re-migration tracker (do not lose)

1. **RC-3 Phase 5** — multichart panel parity (D8): `sync-bridge` + per-panel TF; TAL-00157#22; proposed H-S46.
2. **T2-3a** — peer add/update/remove → `scheduleRender` on each peer (`chart.js:37525+`, `sync-bridge.js:1874+`).
3. **T2-3b** — paused replay host-step → panel B repaint (H-S50 / TAL-01484/01490).
4. **T2-3c** — extend `__TALARIA_ASSERT_INVALIDATION` to chart.js mutation sites.
5. **T2-3d** — React `scheduleRenderDrawing`-only commits (`TalariaV8bLive.jsx:5766`).
6. **TAL-01573** — manual rescale → scoped invalidation (`calculateScales` / adopt-Y), not full mirror reslice storm.
7. **T2-2 axis A1** — click shifts time label (TAL-01565/01583); chart.js only.
8. **H-S44** (tracked RED today) — T1 multichart fallback-B; distinct from proposed RC-3 H-S44 fractional row — **name collision risk** for Lane 4.

---

## Manager summary

| Bucket | Count (approx.) | Action |
|--------|-----------------|--------|
| **fixed_pending_live** | ~10 rows (Phases 3/4/6 + T2 local/save) | PO live on post-`ce3b28d2` build |
| **needs-live** | ~12 rows (Phases 1–2 volume + partial labels) | Live + honest harness upgrade |
| **still-open** | ~25 RC-3 + ~20 RC-2 drawing rows | Schedule post-remigration or chart.js window |
| **deferred-to-remigration** | Phase 5 + T2-3a–d + TAL-01484/90/73 + H-S50 | ESC-016 RC-4 track |
| **I15 gaps** | 7 flagged | Lane 4 scenario requests above |

**RC-3 plan status:** **5/6 phases landed in `ce3b28d2`**; Phase 5 explicitly parked. **RC-2:** ~35% of drawing-relevant invalidation addressed on single-chart paths; multichart peer family entirely deferred.
