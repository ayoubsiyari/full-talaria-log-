# Order / RC-5 / A6 family — closure sweep vs b38 stack

**Task:** Lane 3 read-only inventory (mirror of Lane 5 drawing sweep).  
**Build authority:** **`20260717b38`** — A6-4 Steps 0–6 + interims + Step 3 ready-panels fan-out.  
**Live-confirm authority:** [`A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md`](A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md) (7 rows).  
**Status:** Docs only — no product/harness/registry edits.

**Stack definition (what “b38 stack” means here):**

| Layer | Contents |
|-------|----------|
| **A6-4** | Steps 0–6 + master `__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX`; b38 adds `__TALARIA_DISABLE_ORDER_MC_READY_PANELS_SNAPSHOT_V1` |
| **Interims** | `RESTORE_DEDUPE_V1`, `MC_ORDER_PERSIST_PANEL_SCOPE_V1`, `TRADE_DURATION_NORM_V1`, `MC_REPLAY_PNL_HOST_AGG_V1`, `ORDER_MC_PLACE_REPLAY_GATE_V1`, `ORDER_PROVISIONAL_FOCUS_CANCEL_V1` |
| **Cross-ticker stopgap** | `__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1` (A6-4 Step 0) |
| **Not in stack** | `ORDER_PERSIST_DEDUPE_V1` (unlanded); A6-3 **chart-half** flag; Lane 4 harness rows `H-ORD-MC-*` (spec only) |

---

## Disposition key

| Label | Meaning |
|-------|---------|
| **CLOSES-ON-b38-LIVE-CONFIRM** | Mechanism on b38 stack; PO sign-off = pass named **checklist row** (1–7). Node/harness GREEN is not sufficient alone. |
| **STAGED-NEEDS-LIVE** | Code landed on b38 (or prior) but **outside** the 7-row multichart checklist — needs separate PO pass (usually **single-chart** / draft-entry). |
| **OPEN / UNROUTED** | No fix on b38 stack, or only diagnostic/spec — **gap risk**; does not close on b38 live-confirm. |

---

## Executive summary

| Bucket | Count (primary rows) | Notes |
|--------|---------------------|--------|
| **CLOSES-ON-b38-LIVE-CONFIRM** | **18** | Multichart / F5 / cross-ticker family — rows **1–7** |
| **STAGED-NEEDS-LIVE** | **22** | Single-chart RC-5 + A6-1/2/3 interaction contract + TAL-00752 fixed_pending_live |
| **OPEN / UNROUTED** | **14** | Flagged §4 — not covered by A6-4 + interims + stopgap |

**Gate rule:** b38 **family closure** for multichart order parity = all **7 checklist rows PASS**. STAGED rows may still block broader RC-5 / order-entry **resolved** in registry until PO runs single-chart legs.

---

## Master table — ticket → mechanism → switch → status → checklist row

Rows sorted by **checklist row** (live-confirm first), then STAGED, then OPEN.

| Ticket / ID | Mechanism (short) | Primary switch(es) | Status on b38 stack | Checklist row |
|-------------|-------------------|--------------------|---------------------|---------------|
| **ORD-XPNL** / ORD-XPNL-RED-1 | Cross-ticker mark/close uses focused peer candle → garbage exit PnL | `__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **1** |
| **A6-4 Step 0** | Owning-panel mid mark / close / background bar | same | **CLOSES-ON-b38-LIVE-CONFIRM** | **1** (primary); **4** (secondary mark path) |
| **ORD-MULTICHART-PARITY** (symptom A — lockout) | Replay-enter race + focus routing + stuck provisional on B Execute | `__TALARIA_DISABLE_ORDER_MC_HOST_PLACE_V1`; `__TALARIA_DISABLE_ORDER_MC_PLACE_REPLAY_GATE_V1`; `__TALARIA_DISABLE_ORDER_PROVISIONAL_FOCUS_CANCEL_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **2** |
| **T3 ORD-MC-LOCK** / **H-ORD-MC-LOCK** (spec) | Same lockout class; harness not registered | same + master `__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX` | **CLOSES-ON-b38-LIVE-CONFIRM** (PO checklist); harness **OPEN** | **2** |
| **TAL-01669** | Place order on multichart / panel B | A6-4 Step 2 + interims gate | **CLOSES-ON-b38-LIVE-CONFIRM** | **2** |
| **A6-4 Step 2** | Host-canonical place from parent Execute | `__TALARIA_DISABLE_ORDER_MC_HOST_PLACE_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **2** |
| **A6-4 Step 4** | Open-leg SL/TP patch → host + snapshot fan-out | `__TALARIA_DISABLE_ORDER_MC_OPEN_PATCH_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **3** |
| **A6-1** (multichart SL drag commit) | Apply-on-release + host patch path (not iframe-local SL) | `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX` | **CLOSES-ON-b38-LIVE-CONFIRM** (partial — row 3 is convergence) | **3** |
| **TAL-01602** | SL/TP lines when replay plays (multichart converge) | A6-4 Step 4 + Step 3 projection | **CLOSES-ON-b38-LIVE-CONFIRM** | **3** |
| **ORD-MULTICHART-PARITY** (symptom B — PnL stall) | Host-only tick subscribers; iframe marks not aggregated to rail | `__TALARIA_DISABLE_ORDER_MC_PNL_HUB_V1`; `__TALARIA_MC_REPLAY_PNL_HOST_AGG_V1=false` | **CLOSES-ON-b38-LIVE-CONFIRM** | **4** |
| **T3 ORD-MC-PNL** / **H-ORD-MC-PNL** (spec) | Same dual-replay PnL class | same | **CLOSES-ON-b38-LIVE-CONFIRM** (PO); harness **OPEN** | **4** |
| **Interim Hunk 4** | Trades rail merges iframe OM snapshots | `__TALARIA_MC_REPLAY_PNL_HOST_AGG_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **4** |
| **A6-2** / **TAL-01616** | F5 session-scoped restore (pending + open) | `__TALARIA_DISABLE_ORDER_PERSISTENCE_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **5** |
| **A6-4 Step 1** | Host-only persist; iframe skip restore/write | `__TALARIA_DISABLE_ORDER_MC_HOST_PERSIST_ONLY_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **5** |
| **Interim Hunk 2** | Panel-scoped persist keys (`:panel:host`) | `__TALARIA_MC_ORDER_PERSIST_PANEL_SCOPE_V1=false` OFF | **CLOSES-ON-b38-LIVE-CONFIRM** | **5** |
| **A6-4 Step 3** | Snapshot projection; blocks iframe `addOrder` register | `__TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **5** |
| **A6-4 Step 3 completion (b38)** | `readyPanels` → `applyOrderSnapshot` fan-out (not `addOrder` prime) | `__TALARIA_DISABLE_ORDER_MC_READY_PANELS_SNAPSHOT_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **5** |
| **A6-4 Step 6** | Retire `iframe-order` echo / dual writer | `__TALARIA_DISABLE_ORDER_MC_LEGACY_IFRAME_ORDER_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **5** |
| **ORD-DUP-DURATION** (F5 lines + restore) | Dup rows + missing iframe lines after F5 | combo above + `__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **5** |
| **TAL-01601** | Order on 2-up layout / cross-panel lines | A6-4 full package + b38 ready-panels | **CLOSES-ON-b38-LIVE-CONFIRM** | **5** |
| **Interim Hunk 1** | Restore/mirror id dedupe (`openPositions` + `orders[]`) | `__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **5**, **6** |
| **RC5-ORD-DUP-2** | 4 orders → F5 → 4 unique ids; tab = row count | same + Step 1/6 | **CLOSES-ON-b38-LIVE-CONFIRM** | **6** |
| **T3 ORD-MC-DUP** / **H-ORD-MC-DUP** (spec) | Same dup class | same | **CLOSES-ON-b38-LIVE-CONFIRM** (PO); harness **OPEN** | **6** |
| **ORD-DUP-DURATION** (duration leg) | React row builder epoch norm | `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1` | **CLOSES-ON-b38-LIVE-CONFIRM** | **7** |
| **Interim Hunk 3** | `normalizeEpochMs` in `orderManagerTradeRows.js` | same | **CLOSES-ON-b38-LIVE-CONFIRM** | **7** |
| **RC5-ORD-DURATION-1** | Duration ≈ replay delta ±1m | same | **CLOSES-ON-b38-LIVE-CONFIRM** | **7** |
| **RC5-ORD-DURATION-2** | No 1000h+ from seconds `openTime` | same | **CLOSES-ON-b38-LIVE-CONFIRM** | **7** |
| **T3 ORD-MC-DUR** / **H-ORD-MC-DUR** (spec) | Same duration class | same | **CLOSES-ON-b38-LIVE-CONFIRM** (PO); harness **OPEN** | **7** |
| **RC5-ORD-DUP-1** | 2 panels, 1 order each → host length 2, unique ids (pre-F5) | `__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1` + Step 2/3 | **CLOSES-ON-b38-LIVE-CONFIRM** (subset of row **6** pre-F5) | **6** (implicit); no standalone row |
| **A6-4 master** | Entire host-canonical package | `__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX` | **CLOSES-ON-b38-LIVE-CONFIRM** | **1–6** (bisect nuclear) |
| **RC-5** (root) | Order-entry parse / drag-input family (T4 steps 8–10) | per-row switches below | **STAGED-NEEDS-LIVE** | — (single-chart PO) |
| **RC5-OI-1** / **A6-1** / **TAL-01602** / **TAL-01653** | Apply-on-release SL/TP; committed hit during drag | `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX`; master `__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2` | **STAGED-NEEDS-LIVE** | — |
| **RC5-OI-2** / **OrderEntry#4** / **TAL-00752#4** | Preview SL defer during replay drag (draft) | `__TALARIA_DISABLE_ORDER_PREVIEW_REPLAY_DRAG_FIX` | **STAGED-NEEDS-LIVE** | — |
| **RC5-OI-3** / **OrderEntry#5** / **TAL-00752#5** | Keyboard pan draft scale refresh | `__TALARIA_DISABLE_ORDER_DRAFT_SCALE_REFRESH_FIX` | **STAGED-NEEDS-LIVE** | — |
| **RC5-OI-4** / **A6-3** / **TAL-01615** | Order store unchanged during price-axis gesture (OM half) | `__TALARIA_DISABLE_ORDER_PRICE_AXIS_ISOLATION_FIX` | **STAGED-NEEDS-LIVE** | — |
| **TAL-00752#1,#8,#9,#10,#11,#13,#14,#15,#18,#19,#20,#22** | Order-entry remaining-open / parse / panel fixes | `__TALARIA_DISABLE_ORDER_ENTRY_*` family (see T6 step7 Appendix B) | **STAGED-NEEDS-LIVE** | — |
| **A6-2** (single-chart F5) | Same persist module; single-chart reload | `__TALARIA_DISABLE_ORDER_PERSISTENCE_V1` | **STAGED-NEEDS-LIVE** (row **5** covers multichart F5) | **5** if multichart; else separate |
| **RC5-ORD-DUP-3** | Restore 1 open + `addOrder` same id → skip | `__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1` | **STAGED-NEEDS-LIVE** (node/property only) | — |
| **ORD-EXEC-SLTP-DRAG** | Executed SL/TP line frozen during drag (`updateSLTPLines` vs A6-1) | Predicted: `updateSLTPLines` early-return ( **not landed** ) | **OPEN / UNROUTED** | — |
| **ORDER_PERSIST_DEDUPE_V1** | Persist-time dedupe in blob | **Not landed** (escalation only) | **OPEN / UNROUTED** | — (row **5/6** if dup ids persist after PASS) |
| **A6-3 chart-half** | Full price-axis drag isolation in `chart.js` | Deferred post-combined-build PR | **OPEN / UNROUTED** | — |
| **TAL-00752#2,#3,#6,#7,#12,#16,#17,#21** | Multi-entry avg, flicker, risk split, trailing zero, PNL after TP1, sub-10 lines, wrong fill candle | No b38 switch / not in T4 step 10 | **OPEN / UNROUTED** | — |
| **TAL-01361#1** | Limit cancel leaves TP/SL on screen | Not fixed | **OPEN / UNROUTED** | — |
| **TAL-00704,#49,#74,#98** | TP candle, SL default, multi-TP overlap, PnL color | Not in b38 stack | **OPEN / UNROUTED** | — |
| **TAL-01658,#638,#663,#668,#614,#638** | Multi-entry add, inactive freeze, entry box UI, order types, rail PnL label | Not routed to b38 multichart stack | **OPEN / UNROUTED** | — |
| **TAL-00975** | Journal PNL wrong | Journal app — out of chart b38 stack | **OPEN / UNROUTED** | — |
| **TAL-01104** | Orders vanish on refresh (legacy) | Superseded by **A6-2** for current product; verify under row **5** | **STAGED-NEEDS-LIVE** if still repro | **5** |
| **Lane 4 gate** | D-026 H-R04/H-R05 | Settings transport — not order mechanism | **OPEN / UNROUTED** (ship gate, not PO order row) | — |
| **MC-STEPFWD** | Multichart step-forward cadence | Replay lane — **not order family** | **OUT OF SCOPE** | — |

---

## Checklist row coverage map (inverse index)

| Row | Closes (primary tickets / mechanisms) |
|-----|----------------------------------------|
| **1** | ORD-XPNL, A6-4 Step 0, owning-panel price stopgap |
| **2** | ORD-MULTICHART-PARITY lockout, ORD-MC-LOCK, TAL-01669, A6-4 Step 2, interims replay gate + focus-cancel |
| **3** | A6-4 Step 4 open-leg patch, A6-1 commit path on B, TAL-01602 (multichart converge) |
| **4** | ORD-MULTICHART-PARITY PnL stall, ORD-MC-PNL, A6-4 Step 5, interim PnL host agg |
| **5** | A6-2, A6-4 Steps 1/3/6, b38 ready-panels fan-out, ORD-DUP F5 + iframe lines, TAL-01601, TAL-01616, persist panel scope |
| **6** | RC5-ORD-DUP-1/2, ORD-MC-DUP, ORD-DUP-DURATION dup leg, restore dedupe |
| **7** | RC5-ORD-DURATION-1/2, ORD-MC-DUR, TRADE_DURATION_NORM |

---

## §4 — Gap flags (not covered by A6-4 + interims + stopgap)

These **do not** close on b38 live-confirm even if rows **1–7** pass. Route explicitly before calling the order family “fully closed.”

| # | Gap | Why outside stack | Suggested owner |
|---|-----|-------------------|-----------------|
| **G1** | **ORD-EXEC-SLTP-DRAG** — open SL/TP line visually frozen during drag (A6-1 store correct; render fight) | No landed fix; diagnostic only | Lane 3 freeze-safe `updateSLTPLines` guard |
| **G2** | **RC5-OI-1…4** + **TAL-00752** fixed_pending_live — single-chart / draft interaction | b38 checklist is **multichart-first** | PO single-chart appendix (T4 landing report Appendix F) |
| **G3** | **A6-3 chart-half** — full axis-gesture isolation needs `chart.js` | Explicitly deferred post-combined-build | Separate PR after bless |
| **G4** | **ORDER_PERSIST_DEDUPE_V1** | Intentionally unlanded on b38 | Enable only if row **5/6** PASS but storage blob still dup ids |
| **G5** | **H-ORD-MC-*** harness rows | T3 spec only; Lane 4 not registered | Lane 4 after PO PASS |
| **G6** | **TAL-00752** open sub-rows (#2,#3,#6,#7,#12,#16,#17,#21) | No mechanism on stack | Backlog / T4 follow-on |
| **G7** | **TAL-01361**, misc order UX (#04,#49,#74) | Unrouted | Triage outside A6 closure |
| **G8** | **Journal PNL** (TAL-00975) | Different surface | Journal lane |

---

## Node proof (not substitute for live-confirm)

| Suite | Pass | Discharges (dev-only) |
|-------|------|------------------------|
| `order-owning-panel-price.test.mjs` | 20/20 | Row **1** mechanism |
| `order-interaction-guard.test.mjs` | 36/36 | A6-1 / RC5-OI-1–4 switches |
| `order-host-store.test.mjs` | 16/16 | Row **5** ready-panels fan-out |
| `order-runtime-persist` tests (A6-2) | 16/16 | Row **5** persist |
| `order-entry-*` tests (RC-5) | GREEN | **STAGED** single-chart only |

---

## References

| Doc | Role |
|-----|------|
| [`A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md`](A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md) | PO procedure (7 rows) |
| [`worker-reports/A6-4-HOST-CANONICAL-ORDER-STORE-IMPL-report.md`](worker-reports/A6-4-HOST-CANONICAL-ORDER-STORE-IMPL-report.md) | A6-4 step table + b38 |
| [`worker-reports/A6-4-SWITCH-MAP.md`](worker-reports/A6-4-SWITCH-MAP.md) | Bisect one-pager |
| [`worker-reports/ORD-MULTICHART-INTERIMS-IMPL-report.md`](worker-reports/ORD-MULTICHART-INTERIMS-IMPL-report.md) | Five interim hunks |
| [`worker-reports/ORD-DUP-DURATION-diagnostic-report.md`](worker-reports/ORD-DUP-DURATION-diagnostic-report.md) | RC5-ORD-DUP/DURATION RED ids |
| [`worker-reports/T6-step7-rc5-rc6-closure-sweep-report.md`](worker-reports/T6-step7-rc5-rc6-closure-sweep-report.md) | RC-5 TAL-00752 disposition |
| [`T3-MULTICHART-ORDER-PARITY-HARNESS-SPEC.md`](T3-MULTICHART-ORDER-PARITY-HARNESS-SPEC.md) | ORD-MC-LOCK/PNL/DUP/DUR harness spec |

**Sweep status:** READ-ONLY complete · build **`20260717b38`** · multichart closure = **7/7 checklist PASS** · family closure = checklist + §4 gaps addressed.
