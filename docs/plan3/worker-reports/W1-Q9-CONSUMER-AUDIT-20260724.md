# W1 Worker Report — Q9 consumer audit + b62 exact-tail design

**Worker:** W1 (Lane 1 compute pipeline — capacity fallback / Grok subagent)
**Date:** 2026-07-24
**Directive:** FULL-CAPACITY CYCLE 1 — emergency capacity fallback (Fable 5 API limit)
**Status stamp:** `FABLE-W1-Q9-CORRECTION-LANDED-PENDING-MANAGER-INTEGRATION` *(supersedes `FABLE-W1-STAGE1-LANDED-PENDING-MANAGER-INTEGRATION`, which was BLOCKED by independent review 2026-07-24 — see correction addendum at end)*
**Commit:** none (do not commit / push / deploy from this lane — Manager integrates scoped manifest)
**Product edits:** Q9 stage-1 hunks Q9-A…H in dual-tree `replay-system.js` + test (Fable W1 authored, cycle 9; Q6 window cleared at `2f0ce7831`)

---

## Verdict (stage-1) — updated same-cycle harden

| Track | Verdict | Note |
|---|---|---|
| **Q9 stage-1 design** | **GO (narrow)** | Reusable growing owned **object-array** prefix for **static** playhead cuts only |
| **Zero-copy / alias master as shell** | **NO-GO** | Truncating aliased master destroys history (scaffold proves) |
| **Forming-candle push onto grow buffer / master** | **NO-GO** | Keep dedicated `slice+push` scratch (M1–M3); never push onto master |
| **Replace `rawData` with W6 Float64 stride-6 mirror** | **NO-GO (Q9)** | Layout-compatible with `packBarsRangeCompact`, but distinct shell; typed mirror is M21-2/W6 + W1 B2, not Q9 stage-1 |
| **Index-window API across chart/resample** | **NO-GO (stage-1)** | Blast radius is M21-3a |
| **b62 exact-tail product edit** | **FORBIDDEN until W5** | Design only; blocked on true painted-endpoint RED failing on b61 |
| **Paint-time extrapolation** | **FORBIDDEN** | Director ruling 2026-07-24 (b) — exact tail only |

**Overall stage-1 go/no-go:** **GO to land Q9 stage-1 after Fable sign-off and RED→GREEN evidence**, on the growing owned object-array prefix only (H1/H2 must share one helper). **No b62 product edit** in this cycle. Stamp remains `PRELIMINARY-PENDING-FABLE-SIGNOFF`.

---

## Files produced (this cycle)

| Path | Role |
|---|---|
| `docs/plan3/worker-reports/W1-Q9-CONSUMER-AUDIT-20260724.md` | this report (+ harden addendum) |
| `homepage/public/chart/modules/m20-q9-prefix-slice.test.mjs` | hardened RED scaffold |
| `chart v 1.4/chart/modules/m20-q9-prefix-slice.test.mjs` | dual-tree mirror |
| `docs/plan3/evidence/W1-Q9-20260724-red.json` | RED evidence (`M20_Q9_EVIDENCE=red`) |

**Not edited (file-disjoint held):** `chart.js`, `chart-indicators-full.js`, `order-manager.js`, `replay-system.js` product bodies, W6 fixtures, render-worker scaffolds.

---

## Q9 consumer audit — every prefix slice / copy

Anchors re-verified 2026-07-24 against dual-tree `replay-system.js` (homepage ≡ `chart v 1.4`). Board anchors `:3804/:5526/:6129/:8706` have shifted; live sites below supersede.

### Hot path (per-tick / per-frame) — Q9 stage-1 targets

| # | Site | Fn | Alloc | Downstream ownership assumption | Stage-1 |
|---|---|---|---|---|---|
| H1 | `:3810` | `updateChartData` | `fullRawData.slice(0, sliceEnd)` → `chart.rawData` | Consumers treat `rawData` as a distinct array (length = playhead). **Bar objects are already shared** (shallow slice). M19-H may reuse prior prefix by identity when TF-coalesce fingerprint matches (`:3803-3808`). | **IN** — grow/reuse buffer |
| H2 | `:5578-5579` | `updateChartDataFast` | same slice → assign | Same as H1; always allocates today (no reuse helper). | **IN** |
| H3 | `:8754` | `syncPanelCharts` | slice once, then `_realignMainChartWithReplaySlice` + same-dataset panels | **Already shares one array by reference** across main + same-dataset panels (`pc.rawData = slicedRawData` at `:8807`). Proves consumers tolerate shared prefix ownership. | **IN** |
| H4 | `:7968` | `applyMultichartMirrorFrame` (static, no anim) | `frd.slice(0, sliceEnd)` | Independent of parent-data fast path; allocates when mirror falls through. | **IN** |
| H5 | `:6262` / `:8815` | panel own-data paths | `_panelFullRawData.slice(0, idx+1)` | Per-panel master prefix; same class as H1. | **IN** (per-panel grow buffer) |

### Side / rare paths — defer from stage-1 hot fix

| # | Site | Fn | Notes | Stage-1 |
|---|---|---|---|---|
| S1 | `:3756` | `updateChartData` MC master-growth offset | `fullRawData.slice(rawAdded)` for display-bar count — not playhead install | **OUT** (rare) |
| S2 | `:3246` | replay exit restore | `[...fullRawData]` once on stop — not per-tick | **OUT** |
| S3 | `:3815` | empty-slice emergency restore | `[...fullRawData]` error path | **OUT** |
| S4 | chart.js `:6108` | `_applyIndependentPanelReplaySlice` | caller outside `replay-system.js`; same pattern | Audit-noted; **W1 does not edit `chart.js`** — fold into stage-1 only if Manager assigns, else stage-2 |
| S5 | chart.js `:4887` / `:6151-6153` | isolation / cut helpers | defensive `.slice()` copies of masters — not replay tick churn | **OUT** |

### Owned-array mutation sites — MUST keep materialization

These **mutate the array shell** after slice. A zero-copy view of `fullRawData` is unsafe:

| # | Site | Mutation | Risk if shared with master |
|---|---|---|---|
| M1 | `:6181-6192` `updateChartWithAnimatedCandleForTimeframeChange` | `slicedRaw.push(animatedCandle)` | Appends forming bar onto prefix → would append onto master |
| M2 | `:7771-7772` independent-pair anim mirror | `sliced.push(indep.candle)` | Same |
| M3 | `:7873-7874` same-pair anim mirror (fallback) | `sliced.push(animatedCandle)` | Same |
| M4 | `:6257` `syncPanelChartsWithAnimatedCandle` | `pc.rawData = [...slicedRaw]` | Defensive copy before panel anim path |

**In-place OHLC patches observed on `chart.data` last bar** (`:7880-7883`, `:8030-8034`) — not on `rawData` bar objects from master. Shallow-slice bar sharing is therefore already production reality for committed bars; forming bars are isolated by **pushing a new object**.

### Callers / consumers of the playhead prefix (read model)

| Consumer | Expectation | Safe under growing owned prefix? |
|---|---|---|
| `chart.resampleData(rawData, tf)` / data pipeline | Array-like with `.length` + `[i]` | Yes (same as today) |
| `_trimLastDataBarToReplayPlayhead` | Mutates **resampled** `chart.data`, not master | Yes |
| `_scheduleReplayIndicatorRecalc` / I-f bridge | Reads `chart.data` | Yes |
| Order manager guards / markers | Playhead length + timestamps | Yes |
| Drawing resolve vs playhead prefix | Length/index space | Yes if length semantics unchanged |
| Parent-data mirror (`_tryMirrorFrameFromParentData` `:7608`) | **Shares host `rawData` by reference** | Already stronger than growing prefix |
| Shared-bar-store cache (`chart.js` ~`:9065`) | Must not cache playhead prefix as full master | Unchanged — still identity ≠ `fullRawData` |

### Mutation-assumption summary

1. **Array shell ownership:** hot paths assume they may replace `chart.rawData` with a new array each tick. Stage-1 breaks that assumption intentionally (reuse one shell).
2. **Bar object ownership:** already shared with master via shallow `slice` — not a new risk.
3. **Length semantics:** `rawData.length === playheadEnd` must hold after every install; seek/back **truncates** the owned shell (no future leak).
4. **Identity reuse already exists:** M19-H TF-coalesce (`:3803-3808`), `syncPanelCharts` panel share (`:8807`), parent mirror (`:7608`). Stage-1 extends a proven pattern.
5. **Forming-candle paths** remain on owned `slice+push` scratch — must **not** push onto the stage-1 grow buffer or master (scaffold proves master-shell push corrupts).
6. **H1 + H2 must share one installer** after land (`_installPlayheadPrefix`); kill-switch restores per-call `slice` churn.
7. **W6 typed stride-6** is layout-compatible with B2 packing but is **not** the Q9 `rawData` shell.

---

## Stage-1 design (Q9) — exact hunks manifest (design-only)

Kill-switch (board): `window.__TALARIA_DISABLE_M20_PREFIX_SLICE_V1`
**Semantics:** unset/false → fix **ON** (grow/reuse). `true` → legacy `.slice(0, sliceEnd)` every install.

### Proposed helper (single owner: `replay-system.js`)

```text
_m20Q9PrefixSliceFixEnabled()
_installPlayheadPrefix(master, sliceEnd) → Array
  - kill ON → return master.slice(0, sliceEnd)  // legacy
  - kill OFF:
      if (!_playheadPrefix || _playheadPrefixMaster !== master) rebuild from master[0..sliceEnd)
      else if sliceEnd < length → truncate length (seek/back)
      else if sliceEnd > length → push master[length..sliceEnd) only
      else return same array
      bind chart.rawData = _playheadPrefix
```

Invalidate `_playheadPrefixMaster` on: replay exit, master replace, pair switch, TF master swap, `applyMultichartReplayCut` truncation.

### Exact hunks (re-verify at land; lines shift)

| Hunk ID | File | Location (now) | Change |
|---|---|---|---|
| Q9-A | `replay-system.js` | near class fields / kill helpers | add `_m20Q9PrefixSliceFixEnabled`, `_playheadPrefix`, `_playheadPrefixMaster`, `_installPlayheadPrefix` |
| Q9-B | `replay-system.js` | `updateChartData` `:3809-3811` | replace `fullRawData.slice(0, sliceEnd)` with `_installPlayheadPrefix(...)` (preserve M19-H reuse short-circuit) |
| Q9-C | `replay-system.js` | `updateChartDataFast` `:5577-5579` | same |
| Q9-D | `replay-system.js` | `syncPanelCharts` `:8753-8754` | same; keep panel ref-share |
| Q9-E | `replay-system.js` | `applyMultichartMirrorFrame` static `:7968` | same against `frd` |
| Q9-F | `replay-system.js` | panel own-data `:6262`, `:8815` | per-panel grow buffer keyed by panel master (or call shared helper with panel master) |
| Q9-G | dual-tree | `chart v 1.4/chart/modules/replay-system.js` | mirror A–F |
| Q9-H | tests | `m20-q9-prefix-slice.test.mjs` (+ mirror) | RED→GREEN→kill evidence |

**Explicitly excluded from stage-1 hunks:** M1–M4 forming `slice+push` sites; S1–S5; any `chart.js` / indicator product edit.

### Acceptance for Q9 stage-1 (after land)

1. Behavioral: N forward advances → **one** `rawData` array identity; length grows by N; no O(session) `slice` alloc on the hot path.
2. Seek/back truncates length without leaking future bars.
3. Switch-OFF restores per-tick new identity (`slice`).
4. Multichart same-dataset + parent mirror still paint-coherent.
5. Forming-candle anim paths unchanged (still owned push buffer).

---

## Kill-switch contract

| Item | Value |
|---|---|
| Name | `__TALARIA_DISABLE_M20_PREFIX_SLICE_V1` |
| Default | unset → fix **active** |
| `= true` | legacy `master.slice(0, sliceEnd)` every install (A/B + soak discriminator) |
| Scope | `replay-system.js` playhead prefix install only |
| Does not control | forming `slice+push`, exit restore, chart.js cuts, b62 exact-tail |
| Dual-tree | must appear in both homepage and `chart v 1.4` copies |
| Evidence | RED (pre) → GREEN (ON) → KILL (OFF returns RED churn) |

---

## RED test scaffold (hardened)

**Paths:**

- `homepage/public/chart/modules/m20-q9-prefix-slice.test.mjs`
- `chart v 1.4/chart/modules/m20-q9-prefix-slice.test.mjs`

**Run:**

```bash
node --test --test-concurrency=1 \
  "chart v 1.4/chart/modules/m20-q9-prefix-slice.test.mjs"
```

**Evidence:**

```bash
M20_Q9_EVIDENCE=red node --test --test-concurrency=1 \
  "chart v 1.4/chart/modules/m20-q9-prefix-slice.test.mjs"
```

### Coverage matrix (harden pass)

| Test | Role today | After stage-1 land |
|---|---|---|
| Inventory H1–H5 + M1–M3 + panel ref-share | GREEN (documents surface) | GREEN (sites may move behind helper) |
| Owned-prefix mutation safety | GREEN (spec) | Still GREEN — prove shell ≠ master |
| Seek/backward reset | GREEN (spec) | Product behavioral GREEN |
| Forming-candle push isolation | GREEN (spec + sites retained) | Must stay GREEN (no zero-copy into master) |
| Kill-switch legacy discriminator **model** | GREEN (spec) | Product kill OFF restores churn |
| Desired identity reuse across advances | **RED** (helper absent) | GREEN |
| Fast/normal share `_installPlayheadPrefix` | **RED** (both slice today) | GREEN |
| Kill-switch dual-tree present | soft-fail row / hard in green\|kill modes | GREEN |
| W6 stride-6 ↔ `packBarsRangeCompact` | GREEN (read-only) | Unchanged; no Q9 typed swap |

Latest RED run: **7 pass / 2 fail** (desired product contracts). Evidence: `docs/plan3/evidence/W1-Q9-20260724-red.json`.

---

## W5 partnership — painted-endpoint RED hook audit (no product edit)

PO symptom (b61): host indicator endpoint trails price at high speed; panels OK. Prior gates measured **data tip / bar index**, not pixels — Director review §“Why the GREEN gate did not close”.

### What a true painted-endpoint RED must hook

| Hook | Why | Product edit? |
|---|---|---|
| Wrap `chart.render` **after** candle + indicator paint | Sample the frame the user sees | Harness-only |
| Wrap `drawIndicatorsOptimized` / inner `drawIndicators` | Detect layer-cache blit vs real redraw (`_indLayerCacheKey`) | Harness-only |
| Project tip with `dataIndexToPixel(tipIdx)` + `yScale(tipVal)` **and** last candle close pixel | Pixel delta, not bar-index delta | Harness-only |
| Prefer **host** chart in 4-panel | Matches PO host-only lag | Scenario |
| ≥60 evaluated visible-frame samples at 60× and 100× | Director review §3 | Harness policy |
| No render-count fallback satisfying tick quota | Blind spot in g2 | Harness policy |
| Fail on: tip pixel age > 1 frame, geom behind price pixel, cacheHit with stale tip pixel | Visible contract | Asserts |
| Do **not** fail on mathematical MA≠close distance when tip is frame-fresh | Avoid false RED | Asserts |

### Gap in current g / g2 probes (for W5)

`m19-i-g-browser-exact-five-ma-probe.mjs` records `lastDrawnTipIdxById` from **series arrays inside the draw wrap**, not canvas pixels. `geomBehind` is index/cache based — insufficient for PO eyes. W5 should add `lastDrawnTipPixelById` / `priceClosePixel` in the harness sink without touching product.

### W1 ↔ W5 handoff

- W1 does **not** land b62 until W5’s painted-endpoint probe is **RED on unchanged b61**.
- W1 exact-tail design below is the intended fix shape once that RED exists.
- Q9 stage-1 is independent GC work and may land earlier under Fable sign-off.

---

## b62 exact-tail design only (no extrapolation, no product edit)

**Status:** design freeze pending W5 RED on b61.
**Supersedes** brief §G2 extrapolation option (Director 2026-07-24 (b)).

### Contract

1. At paint time (host async path), before indicator layer blit, run a **synchronous exact tail step** over the last committed/forming bars using **real OHLC** already on `chart.data` / forming candle.
2. Reuse verified slice-pure calculators (`_m19ifBridgeTailResult` family) — same math as worker.
3. Merge only the visible tail window; **worker remains owner of history**.
4. **No guessed / extrapolated** tip beyond the last known bar inputs.
5. Kill-switch (proposed): `__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1` (default fix ON when unset).
6. Acceptance = W5 painted-endpoint probe GREEN + switch-OFF RED + PO feel on host at 60×/100×.

### Explicit non-goals for b62 package

- Paint-time linear/hold extrapolation
- Changing panel sync path (already atomic)
- Q9 growing-prefix (separate kill-switch / evidence)
- M21 render-worker migration

### Sequencing

```text
W5 painted-endpoint RED fails on b61
  → Fable signs this audit
  → Q9 stage-1 LAND (optional parallel once signed)
  → b62 exact-tail + M19-I tail-send package behind its kill-switch
  → local RED→GREEN→kill → exact-digest test deploy → PO visual
```

---

## W6 stride-6 cross-check (read-only — no W6 edits)

| Check | Result |
|---|---|
| W6 `VISIBLE_WINDOW_STRIDE` | `6` → `[t,o,h,l,c,v]` |
| `IndicatorPerf.packBarsRangeCompact` | same element order / Float64 packing |
| Element-wise equality on sample window | **PASS** (scaffold) |
| Runtime shell | W6 = typed mirror; Q9 stage-1 = owned **object** prefix |
| Implication | Layout-compatible for later B2/M21-2 sharing; **Q9 must not replace `chart.rawData` with the typed window** |

Sources consulted (read only): `m21-w6-fixtures/API-CONTRACT.md`, `visible-window-mirror.mjs`, `indicator-performance.js` `packBarsRangeCompact`.

---

## Blockers

| Blocker | Owner | Unblock |
|---|---|---|
| Fable sign-off on this audit + harden | Manager / Fable W1 | Stamp over `PRELIMINARY-PENDING-FABLE-SIGNOFF` |
| Painted-endpoint RED does not yet fail on b61 | W5 | True pixel/frame probe RED evidence on b61 |
| b62 product edit forbidden until that RED | W1 | Hold exact-tail code |
| Q9 product land waits Fable sign-off | W1 | After stamp, land hunks Q9-A…H only |

---

## Next queue (pre-staged)

1. **Fable sign-off** (audit + hardened scaffold).
2. **Land Q9 stage-1** — shared `_installPlayheadPrefix` on H1+H2 (+ H3–H5), kill-switch, GREEN/kill evidence.
3. **Hold b62** until W5 painted-endpoint RED on b61.
4. Keep W6 typed mirror as a **parallel** B2/M21-2 consumer of the same stride-6 layout — do not conflate with Q9 object-prefix land.
5. File-disjoint: no `chart.js` / order-manager / W6 fixture edits from this lane.

---

## Independent verification (Manager / Fable)

1. Re-read slice sites in both trees; confirm H1–H5 / M1–M4 tables.
2. Run hardened RED scaffold; expect **2 desired-product fails**, inventory+spec+W6 **pass**.
3. Confirm no product diff in `replay-system.js` / indicators / W6 fixtures from this cycle.
4. Do not authorize b62 product work until W5 painted RED evidence path is on disk.

---

## SIGNED STAGE-1 LAND ADDENDUM — Fable W1, 2026-07-24 (cycle 9)

**Authorization:** Q6 committed at `2f0ce7831` → `replay-system.js` RELEASED; board cycle-9 row "Fable Q9 narrow stage-1 product land". This addendum is the Fable sign-off over the audit above; stamp is now `FABLE-W1-STAGE1-LANDED-PENDING-MANAGER-INTEGRATION`.

### What landed (exactly the narrow GO)

- One kill-switch: `__TALARIA_DISABLE_M20_PREFIX_SLICE_V1` (unset/false → fix ON; `true` → legacy `master.slice(0, sliceEnd)` per install at every gated site).
- `_installPlayheadPrefix(master, sliceEnd)` — reusable growing OWNED object-array prefix, WeakMap-keyed by **master array identity**; forward advance appends only newly revealed bars; backward seek truncates the shell (`buf.length = end`, no future leak); content always equals `master.slice(0, sliceEnd)`; returned shell is never `master` (zero-copy alias remains NO-GO, including the `end === master.length` case).
- Gated sites: H1 `updateChartData` (M19-H TF-coalesce short-circuit preserved), H2 `updateChartDataFast` (shared installer — audit rule 6 satisfied), H3 `syncPanelCharts` (same-dataset panel ref-share preserved), H4 `applyMultichartMirrorFrame` static, H5 both panel own-data installs (per-panel buffer keyed by `_panelFullRawData`).
- Invalidation: master replace / pair switch / TF master swap / `applyMultichartReplayCut` all install **new** master arrays → identity-keyed rebuild is automatic; `exitReplayMode` additionally calls `_invalidatePlayheadPrefixes()` for retention hygiene.
- Preserved untouched: committed Q6 hunks (byte-exact), M1–M4 forming `slice+push` scratch sites, S1–S5 side paths, `chart.js` / order-manager / indicators / Q5-Q7 / W3 / W6 files. W6 descriptor discipline used as design guidance only (owned shell exposes exact length, no stale tail); **no render pool wired**.

### Evidence chain (RED → GREEN → switch-OFF discriminator)

| Mode | File | Result |
|---|---|---|
| RED (pre-land) | `evidence/W1-Q9-20260724-red.json` | 7 pass / 2 desired-product fails (helper absent) |
| GREEN (fix ON) | `evidence/W1-Q9-20260724-green.json` | 15/15 tests, 49/49 rows; real installer: **one** identity across 40 advances, len 140; seek 180→40 truncates same shell; master swap rebuilds; per-master isolation; forming scratch isolated |
| KILL (switch OFF) | `evidence/W1-Q9-20260724-kill.json` | `product-killOFF-restores-slice-churn` distinct=25/25 fresh legacy slices on the real installer; reuse resumes when switch cleared |

### Gates run (both trees)

- Focused Q9 gate: 15 pass / 0 fail on **both** mirrors (test-runner root-detection fix included — `homepage/docs/plan3` previously shadowed repo root and made the homepage mirror unrunnable).
- Syntax: `node --check` clean; parity: `git hash-object` identical (`bc8d34c0`) across trees.
- Broad replay regressions: Q6 float-listeners, M19-H, M19-I-g2, M19-I-f, M2 canonical mark, pair-switch playhead, autoscroll right-gap, crop refresh restore, mode-switch price, step-forward SLTP flush, M10 runtime PnL frame → **44 pass / 0 fail / 1 known evidence-writer skip**; M19-I indicator tail + indicator-replay-ui-sync → 22 pass / 0 fail; Q5/Q7 outbound drains → 5 pass / 0 fail / 1 skip.

### Manager integration manifest

`docs/plan3/evidence/W1-Q9-20260724-HUNK-MANIFEST.json` (Q9-A…H, files, anchors, evidence, gates). W1 does not commit/push/deploy.

### Next queue (updated)

1. **Manager** integrates the scoped manifest above.
2. **b62 exact-tail** product package **only after the independent GPT accepts the W5 b61 value/Y painted-endpoint RED** (design frozen in this report; extrapolation remains FORBIDDEN per Director 2026-07-24 (b)).
3. Q9 stage-2 candidates (S1–S5, `chart.js:_applyIndependentPanelReplaySlice`) stay OUT until separately assigned.
4. W6 typed stride-6 mirror remains a parallel B2/M21-2 consumer — not a Q9 `rawData` shell replacement.

---

## CORRECTION ADDENDUM — Fable W1, 2026-07-24 (independent review BLOCK resolved)

**Trigger:** independent review of the uncommitted stage-1 land returned **BLOCK** with two findings. Both were reproduced **RED-first**, corrected, and re-proven GREEN → switch-OFF. Stamp is now `FABLE-W1-Q9-CORRECTION-LANDED-PENDING-MANAGER-INTEGRATION`.

### Finding 1 — stale incremental resample over the reused prefix (CORRECTED)

**Mechanism (reproduced RED):** legacy fresh-slice installs changed `chart.rawData` identity every tick, so `ChartDataPipeline.getResampledSeries` never matched `cache.sourceRef` and always FULL-resampled after an install. The stage-1 reused shell keeps one identity, activating the pipeline's same-`sourceRef` len+1 **incremental** branch (`chart-data-pipeline.js:88-104`, which ignores `dataVersion`). `chart.js:_trimLastDataBarToReplayPlayhead()` (`:8975-8978`) replaces the last display bar **inside `chart.data` — which is the pipeline's `cache.result` identity** — so the incremental branch finalized a playhead-trimmed stale prior bucket instead of rebuilding it from the raw master (coarse display / fine raw replay).

- Reviewer's standalone probe re-run on unfixed product: `reusedPrior h=3,l=1,c=2,v=10` vs `legacyPrior h=10,l=0,c=9,v=100` → `stale: true`.
- New end-to-end oracle (real `_installPlayheadPrefix` → real `ChartDataPipeline` → production trim mechanism) failed **29/30 advances** (first stale at end=2) on the unfixed product → `evidence/W1-Q9-20260724-correction-red.json`.

**Correction (narrowest safe contract — NO `chart-data-pipeline.js` / `chart.js` edit needed):** `ChartDataPipeline` already exposes the public `invalidateResampleCache()` API. `_installPlayheadPrefix(master, sliceEnd, consumerChart)` now drops the **consumer chart's** resample cache on every fix-ON install (`_m20Q9DropConsumerResampleCache`), restoring the legacy "new identity ⇒ full resample" contract exactly. The switch-OFF path stays a literal `master.slice(0, sliceEnd)` with **no** invalidation call (no amplification). The stable-prefix allocation win is untouched (oracle proves one shell identity across 30 advances). H3's same-dataset panels share the one prefix identity, so the panel-share branch calls the same helper for `pc` before `pc.resampleData` (no-op under kill). The parent-data mirror (`_tryMirrorFrameFromParentData`) shares `parent.data` directly and never resamples the shared shell — audited, no invalidation needed.

**Same-identity content replacement:** O(1) identity sentinels on reuse (`buf[0] === master[0]`, `buf[keep-1] === master[keep-1]`) rebuild a fresh shell when a master slot was replaced in place at the head or retained-tail boundary. Interior replacement requires a new master array or `_invalidatePlayheadPrefixes()` — no production path replaces master slots in place (M-table above); the invariant is now enforced at the boundaries and documented.

### Finding 2 — untracked W6 fixture import (CORRECTED)

The Q9 test mirrors imported `./m21-w6-fixtures/visible-window-mirror.mjs` (untracked, absent from HEAD, excluded from the scoped manifest). Reproduced RED: a clean scoped checkout failed with `ERR_MODULE_NOT_FOUND` (0 pass / 1 fail). The import is **removed**; the stride-6 `[t,o,h,l,c,v]` layout contract is asserted **self-contained** against the tracked production packer (`indicator-performance.js` `packBarsRangeCompact`), and the full W6 fixture comparison is **report-only**: it was element-wise verified in the prior cycle (see "W6 stride-6 cross-check" section above) and remains a design-guidance statement, not a Q9 runtime dependency.

### Correction test coverage (both mirrors, byte-identical)

| Test | Covers |
|---|---|
| `correction oracle: reused prefix→pipeline→trim ≡ legacy` | End-to-end ReplaySystem→ChartDataPipeline→playhead-trim; byte/value equivalence vs legacy fresh-slice full resample on every advance; alloc win retained (distinct=1) |
| `zero/one/full/over-length installs stay pipeline-equivalent` | 0 / 1 / full / over-length (clamped) / truncate / regrow, content + pipeline equivalence each step |
| `same-identity slot replacement rebuilds the shell` | Tail-boundary + head slot replacement detection; explicit `_invalidatePlayheadPrefixes()` rebuild |
| `switch OFF stays legacy-correct` | Kill restores literal per-install slice churn (18/18 distinct) AND remains value-equivalent (stale=0) |
| `stride-6 self-contained` | Layout contract vs tracked packer; object-prefix vs typed-window boundary — no W6 import |

### Evidence chain (correction cycle)

| Mode | File | Result |
|---|---|---|
| RED (pre-land, historical) | `evidence/W1-Q9-20260724-red.json` | unchanged (7 pass / 2 desired-product fails) |
| CORRECTION RED | `evidence/W1-Q9-20260724-correction-red.json` | 17 pass / 2 fail on unfixed product (oracle staleTicks=29/30; sentinel absent) + finding-2 clean-scope `ERR_MODULE_NOT_FOUND` + reviewer probe `stale:true` |
| GREEN (regenerated) | `evidence/W1-Q9-20260724-green.json` | 19/19 tests; oracle 30/30 equivalent; alloc win distinct=1 |
| KILL (regenerated) | `evidence/W1-Q9-20260724-kill.json` | 19/19; switch OFF = 25/25 fresh legacy slices AND oracle churn 18/18 distinct with stale=0 |
| CLEAN SCOPE | `evidence/W1-Q9-CORRECTION-20260724-clean-scope.json` | `git worktree` at HEAD `2f0ce7831` + ONLY the scoped manifest files: **19 pass / 0 fail both mirrors**, W6 fixtures absent |

### Gates re-run (both trees)

- Focused Q9: **19 pass / 0 fail** on both mirrors (was 15; +4 correction tests).
- Syntax `node --check` clean; product parity `git hash-object` identical (`43c671b5`) across trees; diff vs HEAD is 128 additions / **6 deletions** per mirror — the six deletions are exactly the six legacy slice lines (Q6 hunks byte-preserved).
- Broad replay regressions identical to the pre-correction baseline: 44 pass / 0 fail / 1 known skip; M19-I indicator tail + indicator-replay-ui-sync 22 pass / 0 fail; Q5/Q7 outbound drains 5 pass / 0 fail / 1 skip.
- Preserved: exactly **one** kill-switch, five approved static categories / **six** gated lexical install sites, M1–M4 forming `slice+push` scratch, S1–S5 side paths, no `chart.js` / `chart-data-pipeline.js` / order-manager / indicator / W3 / W6 / b62 edits.

### Manager integration notes

1. Scoped commit manifest (11 files) is in `evidence/W1-Q9-20260724-HUNK-MANIFEST.json` → `scopedCommitManifest`.
2. **`docs/` is gitignored (`.gitignore:24`)** — the report/evidence files require `git add -f` (independent-review follow-up 5).
3. W1 does not commit/push/deploy.
