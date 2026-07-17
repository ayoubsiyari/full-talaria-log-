# RC-3 anchoring + re-migration / chrome ticket-family closure sweep

**Task:** Lane 1 read-only inventory — map RC-3 (drawing anchoring) and re-migration selection/chrome family to closure disposition on **blessed `20260717b16`** and **combined-line builds** (`20260717b03` D-026, `20260717b37` A6-4).  
**As-of:** 2026-07-17  
**Status:** Docs only — no product/harness/registry edits.

**Build authority:**

| Build | Role | Gate posture |
|-------|------|--------------|
| **`20260717b16`** | **BLESSED** PO parity-checklist build ([`T0-lane4-bless-b16-report.md`](worker-reports/T0-lane4-bless-b16-report.md)) | Manager gate PASS r2; **`gate:react` 3/3 PASS**; `reactParity.knownFailing` **{}** |
| **`20260717b03`** | D-026 panel-B settings transport cut | H-R04/H-R05 **10/10 ON** (isolated); carried into b16 |
| **`20260717b37`** | b16 + A6-4 order store (dev-only) | Manager gate PASS; **`gate:react` FAIL** — **H-R09** regression vs b16 |

**Disposition key:**

| Label | Meaning |
|-------|---------|
| **CLOSED-VERIFIED** | Landed fix + harness/gate proof on blessed or combined cut (isolated ×10 or 3× full `gate:react` where cited) |
| **STAGED-NEEDS-RETEST** | Fix landed in tree / blessed build; **PO live-confirm** or targeted **S-session** still required |
| **OPEN** | No landed fix, failing gate, or **spec-only / contingency** — not closed |

**Retest session column:** harness row id, PO checklist section, or manager `gate` / `gate:react` as applicable.

---

## 1. Executive summary

| Family | Items inventoried | CLOSED-VERIFIED | STAGED-NEEDS-RETEST | OPEN / gap |
|--------|-------------------|-----------------|---------------------|------------|
| **RC-3 T5 phases 1–4, 6** | 5 landed phases | H-S40/41/42 anchor acceptance (b16) | Phases 1–4, 6 — **PO spot-check** on b16 | **Phase 5** multichart anchoring parity |
| **RC-3 post-bless / VP adjacency** | R2, R3/R4, P0, H-S42 Worker 5 | H-S42 **10/10** (b16) | R3/R4 engine b15; D-029 R2 **spec only** | V9 label bridge, R5 chrome, coordinates reposition |
| **Re-migration engine (RC-4 P1–P5)** | H-R02–H-R07, H-R03 dedupe | H-R02/03/06/07 **10/10**; b16 full react gate | PO parity rows 3, 6, 7 | — |
| **Chrome / settings (D-024, D-026)** | H-R01, H-R04/05, H-R12/13, ESC-021 | b16 **3× gate:react**; D-026 **10/10 ON** | H-R04 **9/10** flake on b37; chrome **interactive barrier** not landed | H-R09 session flake; contingency spec only |
| **Re-migration P6 / backlog** | H-R08, H-R14, OT-MS | — | — | Prep banked / spec backlog |
| **HR-PARITY registry** | #1–#11 | #1–3, #7–10 closed D-021 artifact | #4–6 partial via engine fixes | #11 iframe hit-test; #6 stale vs H-R09 |

**Manager read:** RC-3 **engine phases are landed** (5/6); **Phase 5** and many **PER-BUG RC-3 rows** remain **OPEN** or **needs-live**. Re-migration **interaction core is CLOSED-VERIFIED on b16**; **chrome timing** (H-R09) is **not** a bless blocker on b16 but **regressed on b37** and needs **Lane 4 barrier** (+ optional contingency product spec).

---

## 2. RC-3 — T5 anchoring phases (root RC-3)

| Ticket / id | Mechanism | Fix / switch | Status (b16 baseline) | Retest session |
|-------------|-----------|--------------|------------------------|----------------|
| **RC-3 Phase 1** — volume render read-only resolve (D1/D2) | `render()` used index path → recursion / wrong wall-clock with `timestampPoints` | `__TALARIA_RC3_VOLUME_RENDER_RESOLVE` (unset = ON) · `drawing-tools-advanced-volume.js` · commit `caf42f4f` | **CLOSED-VERIFIED** — H-S40/H-S41 promoted after honest probe ([`T0-step17-lane4-close-loose-items-plus-red-audit-report.md`](worker-reports/T0-step17-lane4-close-loose-items-plus-red-audit-report.md)) | **H-S40**, **H-S41** (manager `gate`) |
| **RC-3 Phase 2** — clamp / anchored VP right edge | `resolveAnchoredVolumeProfileRange`, `CANDLE_INDEX_CLAMPED_TYPES`, render endIndex | `__TALARIA_RC3_CLAMP_POLICY` · `drawing-tools-base.js` + volume module ([`T5-step3-phase2-clamp-policy-report.md`](worker-reports/T5-step3-phase2-clamp-policy-report.md)) | **STAGED-NEEDS-RETEST** — engine landed; no dedicated gate row beyond H-S42 class | PO: anchored/fixed-range VP **1m→5m** + extend-right at last candle · **TAL-00323#9** |
| **RC-3 Phase 3** — paste timestamp offset (D4) | Clipboard offset in index space → wrong candle after pan/prepend | `__TALARIA_RC3_PASTE_TIMESTAMP_OFFSET` · manager bundle `ce3b28d2` ([`T5-step4-phase3-paste-timestamp-report.md`](worker-reports/T5-step4-phase3-paste-timestamp-report.md)) | **STAGED-NEEDS-RETEST** — dev probe GREEN; discharges **TAL-01383**, **TAL-00253** | PO: copy → pan/prepend → paste · `t5-step4-paste-timestamp-proof.mjs` class |
| **RC-3 Phase 4** — fractional placement (D5/D6) | Integer bar snap on placement vs sub-candle magnet | `__TALARIA_RC3_FRACTIONAL_PLACE` ([`T5-step5-phase4-fractional-place-report.md`](worker-reports/T5-step5-phase4-fractional-place-report.md)) | **STAGED-NEEDS-RETEST** — discharges **TAL-00157#4** (partial **TAL-00322#12/13**) | PO: between-candle trendline → TF switch · `t5-step5-fractional-place-proof.mjs` |
| **RC-3 Phase 6** — label / Gann anchoring | Fib level labels drift on pan; Gann label position | `__TALARIA_RC3_LABEL_ANCHOR` ([`T5-step6-phase6-label-anchor-report.md`](worker-reports/T5-step6-phase6-label-anchor-report.md)) | **STAGED-NEEDS-RETEST** — discharges **TAL-00271#9/#10** (partial #2) | PO: Gann/fib pan-right · `t5-step6-label-anchor-proof.mjs` |
| **RC-3 Phase 5** — multichart anchoring parity (D8) | Cross-panel draw pollution; parent chrome ownership; indicator list sync; replay step fan-out | **Proposed** `__TALARIA_RC3_MC_PARITY_PHASE5` — **not landed** ([`T3-step6-remigration-plan-READONLY-report.md`](worker-reports/T3-step6-remigration-plan-READONLY-report.md)) | **OPEN** — parked for **RC-4 re-migration** / `sync-bridge.js` ([`MANAGER-ESCALATIONS.md`](MANAGER-ESCALATIONS.md) § post-unfreeze) | **H-S45–H-S50** (manager `gate` — **FAIL** on b38 shipgate logs) |

---

## 3. RC-3 — Harness acceptance rows (anchor persistence)

| Ticket / id | Mechanism | Fix / switch | Status (b16) | Retest session |
|-------------|-----------|--------------|--------------|----------------|
| **H-S40** | Bar-open drift probe (was dishonest `data[round(x)].t`) | Phase 1 + Lane 4 honest `timestampPoints` read | **CLOSED-VERIFIED** — promoted [`RESOLUTION-TRACKER.csv`](RESOLUTION-TRACKER.csv) | **H-S40** manager `gate` |
| **H-S41** | Same family as H-S40 | Same | **CLOSED-VERIFIED** — promoted | **H-S41** |
| **H-S42** | Anchored VP right-edge timestamp drift on TF switch | Phase 2 + Worker 5 **`__TALARIA_DISABLE_ANCHORED_VP_RIGHT_EDGE_TIMESTAMP_FIX`** · **b16** ([`T0-lane4-bless-b16-report.md`](worker-reports/T0-lane4-bless-b16-report.md)) | **CLOSED-VERIFIED** — **10/10** `bless-hs42-isolate-x10-b16.txt` | **H-S42** isolated ×10 |
| **H-S25** | Same-TF replay follow X-jump | **Reclassified OUT of RC-3** → `panel-cmd-bridge.js` eased follow (T8 / D-017 family) | **OPEN-TRACKED** (not RC-3 closure) | **H-S25** replay gate |

---

## 4. RC-3 — Adjacent VP / anchor cluster (not T5 phase switches)

Cross-ref [`A8-VP-FAMILY-CLOSURE-SWEEP.md`](A8-VP-FAMILY-CLOSURE-SWEEP.md). Included here because testers file under anchoring / VP.

| Ticket / id | Mechanism | Fix / switch | Status (b16 line) | Retest session |
|-------------|-----------|--------------|-------------------|----------------|
| **A7b P0** — whole-chart freeze on VP place | `resolveDrawingPoints` ↔ `resolveAnchoredVolumeProfileRange` recursion | Break in `drawing-tools-base.js` + render guard + bin cache · **b15** | **STAGED-NEEDS-RETEST** | PO: place anchored VP without hang · [`A7b-P0-anchored-VP-freeze-report.md`](worker-reports/A7b-P0-anchored-VP-freeze-report.md) |
| **TAL-01665–01667** (scale vanish) | `margin.r` collapse multichart VP | **`D-029 R2`** — `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX` | **OPEN (SPEC'D-HELD)** — [`D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md`](D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md) post-bless `chart.js` | **H-A7b-R2** (not in gate yet) |
| **TAL-01666/01667** (pan block) | VP body captures pan | **`__TALARIA_DISABLE_VP_BODY_PAN_BLOCK_FIX`** · **b15** | **STAGED-NEEDS-RETEST** | PO: drag pan on VP zone background |
| **TAL-01662/01664** (VP labels) | R4a geometry + R4b default-on labels | `__TALARIA_DISABLE_VP_AXIS_HIGHLIGHT_GEOMETRY_FIX` · `__TALARIA_DISABLE_VP_AXIS_LABEL_DEFAULT_ON_FIX` | **STAGED-NEEDS-RETEST (PARTIAL)** — engine **b15**; **V9 `avStyle` bridge gap** | PO + **`H-A8-VP-1`** when spec lands · [`A8-VP-V9-LABEL-BRIDGE-IMPL-SPEC.md`](A8-VP-V9-LABEL-BRIDGE-IMPL-SPEC.md) |
| **TAL-01661** (cross-layout VP preview) | `_syncLivePreviewDrawing` → all panels | RC-4 preview filter — **no switch** | **OPEN** — RC-4 tranche | Re-migration / manager RC-4 |
| **TAL-01656/01657** (handle chrome count) | Duplicate SVG handles (cosmetic) | **WONTFIX-candidate** — [`A8-ANCHOR-CHROME-SPEC.md`](A8-ANCHOR-CHROME-SPEC.md) | **OPEN (no fix)** — optional R5 tranche lowest priority | PO visual only if Manager overrides |
| **TAL-01624** (keyboard zoom anchor) | `zoomAtLastCandle` vs visible right edge | Proposed `__TALARIA_DISABLE_KEYBOARD_ZOOM_VISIBLE_RIGHT_EDGE_FIX` | **OPEN (SPEC'D-HELD)** — frozen `chart.js` | Post-bless core batch |

---

## 5. Re-migration — engine substrate (RC-4 phases 1, 4, 5)

| Ticket / id | Mechanism | Fix / switch | Status (b16) | Retest session |
|-------------|-----------|--------------|--------------|----------------|
| **H-R02** — Ctrl-select actuation | Hit-coord / Phase 1 substrate | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` + harness `--hr02-actuation-miss` discriminator | **CLOSED-VERIFIED** — 10/10 ON; D-023 discriminator | **H-R02** ×10 · PO checklist **row 3** (partial) |
| **H-R03** — panel-B ctrl multi-select | Iframe dedupe + synced-drawing pick | `__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1` · `ecaa8a9c` | **CLOSED-VERIFIED** — 10/10 ON; 10/10 FAIL switch-OFF | **H-R03** ×10 · PO **row 3** |
| **RC-1 / Phase 1** | First-click dead on fallback-B | Re-migration lifecycle + engine flags | **CLOSED-VERIFIED** — [`RESOLUTION-TRACKER.csv`](RESOLUTION-TRACKER.csv) | **H-R02**, **H-R03** |
| **H-R06** — Delete | Keyboard bridge reads `dm.selectedDrawings` | `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` · `f46e6d9d` | **CLOSED-VERIFIED** — 10/10 ON/OFF A/B | **H-R06** ×10 · PO **row 6** |
| **H-R07** — peer isolation | Cross-panel select leak | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` · `52894a8d` | **CLOSED-VERIFIED** — 10/10 ON; `--phase5-off` FAIL | **H-R07** ×10 · PO **row 7** |
| **H-S34 / H-S35 / H-S44** | Peer / fallback-B (P5 adjacency) | P5 master + peer deselect switches | **STAGED-NEEDS-RETEST** — removed from react KF on b16; host gate tracked-red family | Manager **`gate`** peer rows |

---

## 6. Re-migration — chrome / settings / quick-bar (D-024, D-026, routing)

| Ticket / id | Mechanism | Fix / switch | Status | Retest session |
|-------------|-----------|--------------|--------|----------------|
| **D-024 / ESC-021** — chrome DOM-ready ordering | Gear-ready before `#tl-sett` commit; stale iframe emit | `__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4` · parent `v9EmitQuickBarChromeDomReady` | **CLOSED-VERIFIED (product)** on b16; harness `waitForParentV9ChromeDomReady` landed | **`--chrome-dom-ready-off`** A/B · **H-R04**, **H-R05** |
| **Lane 4 barrier (follow-on)** — interactive chrome | Dom-ready cache ≠ bar rect stable | **`waitForParentV9ChromeInteractive`** — **spec in diagnostic only**, not landed in harness | **OPEN (harness)** — [`T3-panelB-chrome-readiness-race-diagnostic-report.md`](worker-reports/T3-panelB-chrome-readiness-race-diagnostic-report.md) §8 | Blocks deterministic **H-R09** / **H-R01** under session pressure |
| **D-026 / ESC-023** — panel-B settings transport | iframe dbl-click → parent settings; dismiss ordering | `__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1` (+ A depth `…_A_V1`) · **b03** | **CLOSED-VERIFIED** — H-R04/H-R05 **10/10 ON** b03/b38; switch-OFF honest RED | **H-R04**, **H-R05** ×10 · PO **rows 4–5** |
| **Chrome routing V3** — focus on iframe select | `multichart-drawing-selected` → `focusPanelById` + guard | `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` | **CLOSED-VERIFIED (landed)** — part of b16 stack; ORDER_MC OFF does not bisect H-R09 | **H-R12**, **H-R13** |
| **Quickbar settings fix V2** — iframe toolbar hide | Parent owns V9 bar in embed | `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` (historical) | **CLOSED-VERIFIED (landed)** | **H-R12** step-14 litmus |
| **H-R01** — single-click → parent V9 bar | Hit-coord + D-024 wait (panel B first in scenario) | Composite above | **CLOSED-VERIFIED** b16 **3× gate:react**; **8–10/10** isolated flake class (`cdr-hr01-on-x10`) | **H-R01** ×10 · PO **row 1** |
| **H-R04** — dbl-click settings open/stays | D-024 + D-026 | D-026 switch | **CLOSED-VERIFIED** b16; **STAGED** b37 **9/10** (one dom-ready timeout) | **H-R04** ×10 |
| **H-R05** — Esc after settings | D-026 Esc user-close bypass | D-026 switch | **CLOSED-VERIFIED** b16/b38 **10/10** | **H-R05** ×10 |
| **H-R12 / H-R12A** — gear → settings | Panel B iframe gear → parent modal | D-024 dom-ready + routing | **CLOSED-VERIFIED** b16 | **H-R12**, **H-R12A** |
| **H-R13** — iframe dbl-click settings | Same transport as H-R04 | D-026 | **CLOSED-VERIFIED** b16 (flash-close probe PASS) | **H-R13** · PO **row 4** |
| **H-R09** — select → dbl-click → Esc chain | Panel-B **live-resolve / dom-ready lag** vs store (`storeOk` + `v9BarVisible=false`) | No product fix landed; **contingency spec only** [`H-R09-LIVE-RESOLVE-HARDENING-SPEC.md`](H-R09-LIVE-RESOLVE-HARDENING-SPEC.md) | **STAGED-NEEDS-RETEST** — **PASS** b16 `bless-gate-react-b16-final-r3.txt`; **FAIL** b37 full suite; **8–9/10** isolated flake | **H-R09** ×10 · **`gate:react`** full suite · PO **row 9** |
| **TAL-01494** — settings (open registry) | Overlaps H-R04/H-R13 transport + chrome | D-026 partial | **STAGED-NEEDS-RETEST** — engine/harness green; PO ticket still **open** in [`TICKET-REGISTRY.csv`](TICKET-REGISTRY.csv) | PO **row 4** / **9b** on **b16** |

---

## 7. Re-migration — deferred / backlog chrome-adjacent

| Ticket / id | Mechanism | Fix / switch | Status | Retest session |
|-------------|-----------|--------------|--------|----------------|
| **H-R08** — Ctrl+drag marquee | Phase 6 iframe-local marquee | Phase 6 switch (prep banked) | **OPEN (DEFERRED)** — [`RESOLUTION-TRACKER.csv`](RESOLUTION-TRACKER.csv) | **H-R08** when P6 impl |
| **H-R14** — marquee variant | Same prep | Same | **OPEN (DEFERRED)** | **H-R14** |
| **OT-MS** — objects-tree multi-highlight | Wrong read path (`lifecycleStore` vs `selectedDrawings[]`) | `__TALARIA_DISABLE_OBJECTS_TREE_MULTISELECT_HIGHLIGHT_V1` | **OPEN (SPEC'D-HELD)** — [`OT-MS-IMPL-SPEC.md`](OT-MS-IMPL-SPEC.md) post-P1 backlog | **OT-MS-01/02/03** |
| **PLAN2-FOUND#3** — tree duplication | Geometry vs id dedupe | `__TALARIA_DISABLE_OBJECTS_TREE_MULTICHART_DEDUPE_V1` (prototype) | **OPEN** — independent of OT-MS | PO 4-up inventory |
| **HR-PARITY#11** — iframe dbl-click → canvas miss | `deselectAll(fromCanvasBackground)` duplicate actuation | D-026 mitigates parent close; **root hit-test not fixed** | **OPEN** — non-blocking per D-026 report | Live dbl-click on panel B body |

---

## 8. HR-PARITY registry — disposition vs b16

| Registry id | Maps to | Mechanism | Fix / switch | Status (b16) | Retest session |
|-------------|---------|-----------|--------------|--------------|----------------|
| **HR-PARITY#1** | H-R01 | Harness click-miss (retracted) | Hit-coord + D-024 wait | **CLOSED-VERIFIED** (D-021 artifact) | **H-R01** |
| **HR-PARITY#2** | H-R04 | Click-miss | D-024 + D-026 | **CLOSED-VERIFIED** (D-021) | **H-R04** |
| **HR-PARITY#3** | H-R05 | Click-miss | D-026 | **CLOSED-VERIFIED** (D-021) | **H-R05** |
| **HR-PARITY#4** | H-R06 | Delete store | Panel keyboard V1 | **CLOSED-VERIFIED** | **H-R06** |
| **HR-PARITY#5** | H-R07 | Dual-select leak | P5 peer isolation | **CLOSED-VERIFIED** | **H-R07** |
| **HR-PARITY#6** | H-R09 | Panel-B chain / V9 bar | Chrome readiness + live-resolve lag | **STAGED-NEEDS-RETEST** — registry text **stale** (pre-b16); b16 gate PASS, b37 flake | **H-R09** · PO **row 9** |
| **HR-PARITY#7** | H-R13 | Settings click-miss | D-026 | **CLOSED-VERIFIED** (D-021) | **H-R13** |
| **HR-PARITY#8** | H-R08/H-R14 | Marquee click-miss | Hit-coord | **CLOSED-VERIFIED** (D-021) | **H-R08**, **H-R14** |
| **HR-PARITY#9** | H-R02 | Store desync | Phase 1 | **CLOSED-VERIFIED** (D-021) | **H-R02** |
| **HR-PARITY#10** | H-R03 | Ctrl multi-select | Phase 1 + dedupe V1 | **CLOSED-VERIFIED** (D-021) | **H-R03** |
| **HR-PARITY#11** | H-R04 class | Iframe hit-test / dismiss | D-026 transport partial | **OPEN** — follow-up `drawing-tools-manager.js` | PO dbl-click edge cases |

---

## 9. PER-BUG RC-3 rows — rollup (not one-by-one)

**Source:** [`PER-BUG-REGISTRY.csv`](PER-BUG-REGISTRY.csv) — **~40** `user_replied` RC-3 rows. Full row-level map: [`T7-step1-drawing-anchoring-closure-sweep-report.md`](worker-reports/T7-step1-drawing-anchoring-closure-sweep-report.md) § Closure table.

| Symptom bucket | Example tickets | Landed phase / fix | Status on b16 | Retest session |
|----------------|-----------------|-------------------|---------------|----------------|
| Volume / VP wall-clock & labels | TAL-00322#11–17, TAL-00323#2/9/10/13/15 | Phases **1+2** (+ A7b R3/R4 partial) | **STAGED-NEEDS-RETEST** — many **still-open** label geometry / body-drag | PO VP family · **H-S42** |
| Paste / clone displacement | TAL-01383, TAL-00253, TAL-01124 | Phase **3** | **STAGED-NEEDS-RETEST** | PO paste-after-pan |
| Placement / candle edge | TAL-00157#4, TAL-00322#4, TAL-00117#6 | Phase **4** (+ **2** clamp partial) | **PARTIAL** — #4 staged; channel past last candle **OPEN** | PO fractional place |
| Label pan drift (fib/Gann) | TAL-00271#2/#9/#10, TAL-00245#8 | Phase **6** | **STAGED-NEEDS-RETEST** (partial #2) | PO pan-right label stick |
| Generic label mis-anchor (tools) | TAL-00157#9/#11, TAL-00841, TAL-00043 | **Not** fully in T5 scope | **OPEN** — no dedicated phase | PO per-tool |
| Multichart layout + anchoring | TAL-01484, TAL-01490, TAL-01496, TAL-01585 | Phase **5** + RC-4 | **OPEN** | **H-S45–50** + PO layout tickets |

---

## 10. Gaps — not covered by landed fix or existing spec

| # | Gap | Affected tickets / rows | Recommended route |
|---|-----|-------------------------|-------------------|
| **G1** | **RC-3 Phase 5** multichart anchoring parity — no switch, no impl | Phase 5; **H-S45–H-S50** FAIL (b38 gate logs); TAL-00157#22 class | RC-4 / `sync-bridge.js` tranche post-interaction bless |
| **G2** | **`waitForParentV9ChromeInteractive`** — harness barrier **not landed** | **H-R09**, **H-R01** session flake; b37 H-R09 regression | **Lane 4** — [`T3-panelB-chrome-readiness-race-diagnostic-report.md`](worker-reports/T3-panelB-chrome-readiness-race-diagnostic-report.md) §8 |
| **G3** | **H-R09 product contingency** — spec only, **not authorized** until G2 insufficient | [`H-R09-LIVE-RESOLVE-HARDENING-SPEC.md`](H-R09-LIVE-RESOLVE-HARDENING-SPEC.md) | Lane 1 **only if** G2 fails ×10 |
| **G4** | **D-029 R2** axis margin floor — **post-bless `chart.js`** | **TAL-01665–01667** scale leg | [`D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md`](D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md) |
| **G5** | **V9 anchored-VP label bridge** — engine R4b insufficient in shell | **TAL-01662**, **01664** anchored path | [`A8-VP-V9-LABEL-BRIDGE-IMPL-SPEC.md`](A8-VP-V9-LABEL-BRIDGE-IMPL-SPEC.md) |
| **G6** | **VP coordinates-tab reposition** — R4a ≠ full editor parity | **TAL-01664** | Lane 5 diagnostic NEEDS-LIVE |
| **G7** | **Cross-layout VP preview (R1)** | **TAL-01661** | RC-4 manager tranche |
| **G8** | **A8 modifier-drag / locked pan** tranches | **TAL-01593–01655**, **01652** | [`A8-FREEZE-SAFE-IMPL-SPEC.md`](A8-FREEZE-SAFE-IMPL-SPEC.md) — post-bless batch |
| **G9** | **A6-4 order store** — ratified, **not** interaction/chrome | A6-4 | [`A6-4-HOST-CANONICAL-ORDER-STORE-DESIGN.md`](A6-4-HOST-CANONICAL-ORDER-STORE-DESIGN.md) — does **not** close H-R09 |
| **G10** | **Registry hygiene** — HR-PARITY#6 narrative, TAL-01494 **open**, PER-BUG RC-3 **user_replied** bulk | Manager registry commit on PO pass | [`T3-COMBINED-BUILD-MANIFEST.md`](T3-COMBINED-BUILD-MANIFEST.md) §5 blocker #7 |

---

## 11. Recommended PO / gate retest bundle (single b16 session)

Record **`20260717b16`** on host + every iframe before starting ([`MULTICHART-PARITY-CHECKLIST.md`](MULTICHART-PARITY-CHECKLIST.md)).

| Order | Session | Closes |
|-------|---------|--------|
| 1 | Full parity checklist rows **1–9**, **9b**, **11** | H-R01–H-R09, H-R12/13, HR-PARITY#1–10 live |
| 2 | RC-3 spot bundle (§7 handoff in T7-step1) | Phases 1–4, 6 **STAGED→CLOSED** |
| 3 | VP cluster (anchored + fixed-range, 1m→5m) | Phase 2, H-S42 class, TAL-0166x partial |
| 4 | Optional: **`node react-run.mjs --only=H-R09 --runs=10`** on fresh deploy | Confirms chrome flake rate post–Lane 4 barrier |

**Do not** treat **b37** H-R09 fail as bless rollback on **b16** — b37 adds A6-4 churn; isolate with ORDER_MC OFF already **10/10** H-R09 ([`a6-4-hr09-ab-master-off-x10-b38.txt`](worker-reports/a6-4-hr09-ab-master-off-x10-b38.txt)).

---

## 12. Status

**DIAGNOSTIC-ONLY (closure map complete, no registry CSV edits)**

**Summary for Manager:** On **blessed b16**, re-migration **engine + D-026 settings + D-024 product** are **CLOSED-VERIFIED** in harness; RC-3 **5/6 phases landed** with **H-S40–42 CLOSED**; bulk PER-BUG RC-3 and **Phase 5** remain **STAGED/OPEN**. **Chrome timing (H-R09)** is a **harness/session** closure item (**G2**), not a missing engine fix on b16 — product contingency **G3** is spec-only.
