# T3 — Combined-build manifest (D-018 #4)

**Status:** Living document — update as re-migration phases land and staging commits accumulate.  
**Authority:** D-018 ruling #4 — deploy unfreeze ships as **ONE** combined build (re-migration + all accumulated staging work). PO `MULTICHART-PARITY-CHECKLIST.md` sign-off happens on that exact build id; nothing appends after cut.  
**Last shipped baseline (plan-1):** `20260707b105` (`ba85d960` — 29-scenario gate GREEN, I9).  
**Current HEAD tip (pre-combined-cut):** `d6d9822f` — harness `serve.mjs` stamps **`20260715b2`**; `chart.js` still carries stale `CHART_ENGINE_BUILD = '20260715a4'` (Manager must coordinate single canonical bump at cut).

---

## 1. Landed commits to include vs pending

### 1.1 Landed — staging / RC fixes (in `git` HEAD chain)

Commits are listed **oldest → newest** within the unfreeze slice. Several T8/T1 slices landed under generic commit messages (`multi chart`, `phase 2`, `time axis`); hash + worker-report authority is noted where the message is opaque.

| Commit | Track | Staging build | What it carries | PO / harness status |
|--------|-------|---------------|-----------------|---------------------|
| `9fe7aae8` | **T1** Fallback-B | (no bump) | Multichart iframe migration **default OFF** — lifecycle V2, legacy-selection retire V2, ownership V2 predicates (`tool-lifecycle-store.js`, `drawing-tools-manager.js`, `chart.js`, `MultichartGrid.jsx`) | **Active posture** — re-migration must flip these back ON per phase |
| `9b155bbc` | **T8 step 3** | **a1** | Independent-symbol own-master play advance — `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` (later folded into unified switch) | **needs-live** — H-S59b GREEN-SYNTHETIC (WEAK A/B) |
| `c8969af3` | **T8 step 5** | **a2** | Unified edge-park / own-master PLAY advance — `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE`; step-3 switch aliased inside `isPlayEdgeParkAdvanceEnabled()` | **needs-live** (freeze feel) — PO a2 superseded by a3 |
| `4bb97a0b` | **T8 step 5b** | **a3** | H-S20 D-015 coarse-path regression fix on top of a2 | **needs-live** — PO tests **a3** not a2 |
| `f18d8b29` | **T8 step 7** | **a4** | Replay refresh persistence — Track A `__TALARIA_REPLAY_SESSION_PLAYHEAD_RESTORE` + Track B reanchor actuation (`replay-system.js`, `chart.js`, harness H-S79) | **PO-confirmed** (freeze + refresh mid-replay, paused restore) |
| `d457dbe1` | **T8 step 9** | **a5** | Panel TF label sync — `__TALARIA_MC_PANEL_TF_LABEL_SYNC` (`MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `serve.mjs`, H-S80) | **PO-confirmed** (2v 15m, focus B, refresh, no Play → topbar 15m) |
| `baf2ab12` | **T4** RC-5 | (ref a5) | Order-entry families #8/#19 + remaining-open-8 (#1/#9/#11/#13/#14/#15 + close-hittarget) — `order-manager.js`, aggregates, property tests | **needs-live** — 11 `fixed_pending_live` rows (registry delta uncommitted) |
| `3502177c` | **T6** RC-6 M1 | — | `__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE` | **needs-live** (dev property tests only) |
| `314fbb3d` | **T6** RC-6 M2 | — | `__TALARIA_RC6_INDICATOR_VISIBILITY_V2` | **needs-live** |
| `db82aed4` | **T6** RC-6 M3 | — | `__TALARIA_RC6_INDICATOR_SETTINGS_APPLY_V2` | **needs-live** |
| `40be56dd` | **T6** RC-6 M5 | — | `__TALARIA_RC6_INDICATOR_PERSIST_REHYDRATE_V2` | **needs-live** |
| `0d95b05d` | **T6** M4 | — | Diagnostic report only — M4 implement **not** landed | **M4-GATED** |
| `ce3b28d2` | **T5** RC-3 | — | Anchoring phases 1–4,6 — five switches (volume/clamp/paste/fractional/label) | **needs-live** |
| `9462cef3` | **T8 / Lane 2 D-017** | **b2** | Pan-release snap-back — `__TALARIA_MC_DISABLE_PAN_RELEASE_ANCHOR_HOLD` (`chart.js` both trees, SW bump) | **needs-live** — H-S82 PASS (harness); PO b2 confirm pending |
| `d6d9822f` | **T8 step 13** | **b1** (impl) / **b2** (serve stamp) | Finest-TF unified replay cadence — `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` (`replay-system.js`, `panel-cmd-bridge.js`, `MultichartGrid.jsx`, H-S83) | **needs-live** — PO A/B on 4h-focused play |

### 1.2 Landed in tree — fragmented / no single tidy commit hash

| Slice | Build ref | Evidence | Notes |
|-------|-----------|----------|-------|
| **T1 steps 14–18** (V9 toolbar, settings flash, gear route) | `b11`→`b17` lineage | Worker reports `T1-step14` … `T1-step18` | Settings transport **PO-confirmed 4/4 local** on step 18; still needs **staging** live-confirm per D-012 |
| **T1 step 19** (Esc / Delete / marquee / Objects-Tree prototypes) | **`20260712b105`** | `T1-step19-esc-delete-marquee-transport-diagnostic-report.md` | Switch-gated prototypes in tree under `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2`; **DIAGNOSTIC-ONLY** until honest harness + PO |
| **T3 step 4** routing V3 | in tree | `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` | Effective only when ownership V2 ON — blocked by Fallback-B |
| **T2 step 4** invalidation fixes | recent | `T2-step4-invalidation-freezesafe-report.md` | Separate from this manifest's staging slice — include if Manager folds into combined cut |

### 1.3 Pending — must land before combined cut

| Item | Track | Deliverable | Gate |
|------|-------|-------------|------|
| **Phase 0** | Lane 4 | Frozen 12-row honest RED matrix; `known-failing.json` reconcile; `gate:react` baseline | Blocks Phase 1 dispatch |
| **Re-migration P1** | Lane 1 | Engine selection substrate — lifecycle V2 + legacy retire ON in iframe | H-R02/H-R03 10/10; master switch `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` |
| **Re-migration P2** | T3 + L1 | Parent chrome routing — ownership V2 + routing V3 | H-R01, H-R12 10/10 |
| **Re-migration P3** | T3 | Settings transport + flash persistence | H-R04, H-R13 10/10 |
| **Re-migration P4** | T1/T3 | Keyboard bridge Esc/Delete — **new** `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` | H-R05, H-R06 10/10; serialize vs T8 `panel-cmd-bridge` |
| **Re-migration P5** | T3 | Peer isolation | H-R07 + H-S34/35/44 |
| **Re-migration P6** | T1 | Iframe Ctrl+drag marquee | H-R08 panel-B, H-R14 10/10 |
| **RC-3 Phase 5** (optional seventh tranche) | T5 | `__TALARIA_RC3_MC_PARITY_PHASE5` — H-S45–50 | **After** P1–P6 + unfreeze (high collision) |
| **RC-6 M4 implement** | T6 | `__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2` | Optional for first combined cut |
| **Registry commit** | Manager | `PER-BUG-REGISTRY.csv` `fixed_pending_live` deltas | Required before PO closure rows |
| **Harness absorb** | Lane 4 | H-S82 scenario in `scenarios.mjs` (spec in working tree, uncommitted) | Lane 4 scope |
| **Canonical build bump** | Manager | Single `BUILD_ID` across `serve.mjs`, `chart.js`, `dist-v9`, SW caches | At cut only — supersedes a1…b2 |

### 1.4 Explicitly NOT in combined cut (working tree only — do not fold blindly)

| Path | Owner | Reason |
|------|-------|--------|
| `scenarios.mjs` H-S82 body | Lane 4 | Uncommitted harness |
| `known-failing.json` deltas | Lane 4 | Phase 0 reconcile in flight |
| `drawing-tools-ui.js` (+6 lines) | T6 RC-6 M3 | Uncommitted; separate dispatch |
| `PER-BUG-REGISTRY.csv` / `TICKET-REGISTRY.csv` | Manager | Uncommitted registry deltas |

---

## 2. Kill-switch inventory + one-knob revert map

**Convention:** `__TALARIA_DISABLE_*` / `__TALARIA_MC_DISABLE_*` — **unset = fix ON** unless noted. Setting switch **`= true`** reverts to pre-fix behavior (I3/I13).

### 2.1 Re-migration phases (D-018 #2 — one-knob revert per phase)

| Phase | One-knob master (preferred) | Child switches (all must gate every touched file) | Files (primary) | Revert effect |
|-------|----------------------------|---------------------------------------------------|-----------------|---------------|
| **P0** | — (harness only) | Fallback-B defaults | predicates in §2.2 | 12/12 honest RED on default posture |
| **P1** | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` | `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`, `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` | `tool-lifecycle-store.js`, `drawing-tools-manager.js`, `chart.js` | iframe: lifecycle + legacy retire OFF → H-R02/03 RED |
| **P2** | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE2_ROUTING` (designed PREP) | `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`, `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` | `MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `drawing-tools-manager.js` (emit) | No parent V9 bar on panel select → H-R01 RED |
| **P3** | `__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V2` | `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` (settings-open subset) | `MultichartGrid.jsx`, `drawing-tools-ui.js`, `drawing-tools-manager.js` | Settings flash-close / no modal → H-R04/13 RED |
| **P4** | `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` (**new**, mandatory) | May extend quickbar switch after I13 audit | `MultichartGrid.jsx`, `panel-cmd-bridge.js`, `keyboard-shortcuts.js`, `drawing-tools-manager.js` | Esc/Delete no cross-frame → H-R05/06 RED |
| **P5** | `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` | ownership V2 peer slice | `MultichartGrid.jsx`, `multichart-manager.js` | Dual selection → H-R07 RED |
| **P6** | `__TALARIA_DISABLE_MULTICHART_PANEL_MARQUEE_V1` | — | `chart.js`, `drawing-tools-manager.js` | No iframe marquee → H-R14 RED |
| **P7** (post-unfreeze) | `__TALARIA_RC3_MC_PARITY_PHASE5` | reuse migration switches | `sync-bridge.js`, `embed-bridge.js`, drawing modules | H-S45–50 RED |

**Fallback-B exit (unfreeze target):** iframe effective **false** on lifecycle + legacy-retire + ownership for interaction slice; per-phase switches ON (unset) with documented revert.

### 2.2 Fallback-B + T1 interaction bundle (landed — default OFF in iframe)

| Switch | Default (iframe) | Gated files |
|--------|------------------|-------------|
| `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` | OFF (V2 disabled unless `= false`) | `tool-lifecycle-store.js`, `drawing-tools-manager.js` |
| `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` | OFF | `chart.js` |
| `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2` | OFF | `MultichartGrid.jsx` |
| `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` | ON (fix enabled when unset) | `MultichartGrid.jsx`, `panel-cmd-bridge.js`, `drawing-tools-manager.js`, `chart.js` (marquee), `keyboard-shortcuts.js` |
| `__TALARIA_DISABLE_MULTICHART_PANEL_SELECTION_CHROME_ROUTING_V3` | ON | `MultichartGrid.jsx`, `drawing-tools-manager.js` |
| `__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V2` | ON | `MultichartGrid.jsx`, `drawing-tools-ui.js` |

### 2.3 T8 replay / mirror staging (landed)

| Switch | Default | Gated files | Staging build |
|--------|---------|-------------|---------------|
| `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE` | **Retired** — aliased in `isPlayEdgeParkAdvanceEnabled()` | `panel-cmd-bridge.js` | a1 (superseded) |
| `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE` | ON (fix) | `panel-cmd-bridge.js` | a2→a3 |
| `__TALARIA_REPLAY_SESSION_PLAYHEAD_RESTORE` | ON (`!== false`) | `replay-system.js`, `chart.js` | a4 |
| `__TALARIA_MC_PANEL_TF_LABEL_SYNC` | ON (`!== false`) | `MultichartGrid.jsx`, `TalariaV8bLive.jsx`, `serve.mjs` | a5 |
| `__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE` | ON (fix when unset) | `replay-system.js`, `panel-cmd-bridge.js`, `MultichartGrid.jsx`, `serve.mjs` | b1 |
| `__TALARIA_MC_DISABLE_PAN_RELEASE_ANCHOR_HOLD` | ON (fix when unset) | `chart.js` (both trees) | b2 |

### 2.4 RC-5 order-entry (landed `baf2ab12`)

| Switch | Rows |
|--------|------|
| `__TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX` | #8, #19 |
| `__TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX` | #10, #20, #22 |
| `__TALARIA_DISABLE_ORDER_ENTRY_PREVIEW_COLOR_FIX` | #1, #13 |
| `__TALARIA_DISABLE_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX` | #9 |
| `__TALARIA_DISABLE_ORDER_ENTRY_PENDING_SL_CLAMP_FIX` | #11 |
| `__TALARIA_DISABLE_ORDER_ENTRY_CANCEL_CLEANUP_FIX` | #14 |
| `__TALARIA_DISABLE_ORDER_ENTRY_PANEL_SLTP_FIX` | #15 |
| `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` | #18 (prior T4) |

### 2.5 RC-6 indicators (landed)

| Switch | Phase | Status |
|--------|-------|--------|
| `__TALARIA_RC6_INDICATOR_LIFECYCLE_STORE` | M1 | Landed |
| `__TALARIA_RC6_INDICATOR_VISIBILITY_V2` | M2 | Landed |
| `__TALARIA_RC6_INDICATOR_SETTINGS_APPLY_V2` | M3 | Landed |
| `__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2` | M4 | **Not implemented** |
| `__TALARIA_RC6_INDICATOR_PERSIST_REHYDRATE_V2` | M5 | Landed |
| `__TALARIA_RC6_INDICATOR_PANEL_LAYOUT_V2` / `__TALARIA_RC6_INDICATOR_MC_ISOLATION_V2` | M6 | **Parked** (re-migration) |

### 2.6 RC-3 anchoring (landed `ce3b28d2`)

| Switch | Phase |
|--------|-------|
| `__TALARIA_RC3_VOLUME_RENDER_RESOLVE` | 1 |
| `__TALARIA_RC3_CLAMP_POLICY` | 2 |
| `__TALARIA_RC3_PASTE_TIMESTAMP_OFFSET` | 3 |
| `__TALARIA_RC3_FRACTIONAL_PLACE` | 4 |
| `__TALARIA_RC3_LABEL_ANCHOR` | 6 |

---

## 3. Staging build lineage (a1 → a5, b1, b2)

Each staging id is **superseded** by the next; the combined cut must stamp **one new id** that carries the union of all rows below.

| Build | Commit / authority | Carries | Supersedes |
|-------|-------------------|---------|------------|
| **20260715a1** | `9b155bbc` (T8 step 3) | Independent-symbol play advance (D-014); `panel-cmd-bridge.js` | — |
| **20260715a2** | `c8969af3` (T8 step 5) | a1 + unified edge-park / own-master PLAY (D-015) | a1 for freeze PO |
| **20260715a3** | `4bb97a0b` (T8 step 5b) | a2 + H-S20 coarse-path fix | a2 |
| **20260715a4** | `f18d8b29` (T8 step 7) | a3 + refresh playhead restore + reanchor (PLAN2-FOUND#5) | a3 |
| **20260715a5** | `d457dbe1` (T8 step 9) | a4 + TF label sync (PLAN2-FOUND#6, H-S80) | a4 |
| **20260715b1** | `d6d9822f` (T8 step 13) | a5 + finest-TF unified cadence (D-016, H-S83) | a5 |
| **20260715b2** | `9462cef3` + serve stamp | b1 + D-017 snap-back (H-S82) | b1 |

**Combined build (not yet cut):** must equal **b2 content** + **re-migration P1–P6** + **registry-committed** RC-5/RC-6/RC-3 slices + **T1 step 19** prototypes (if Manager includes) + **single canonical** `BUILD_ID` on host and every panel iframe.

**Known stamp drift (pre-cut):** `serve.mjs` → `b2`; `chart.js` `CHART_ENGINE_BUILD` → `a4`. Manager coordinates one bump at cut.

---

## 4. Accumulated staging PO live-confirm checklist

Status key: **confirmed** = PO signed off on stated build; **pending** = needs-live; **blocked** = waiting on re-migration or Phase 0.

| Area | Build to test | PO status | Acceptance surface |
|------|---------------|-----------|-------------------|
| Edge-park / freeze (D-015) | a3+ | **confirmed** (a4 PO bundle) | Same-symbol + independent PLAY — no stuck-until-TF-change |
| Refresh persistence (paused playhead) | a4 | **confirmed** | Mid-replay refresh → same timestamp, paused, no auto-play |
| TF label sync | a5 | **confirmed** | 2v both 15m, focus B, refresh, topbar reads 15m without Play |
| Finest-TF cadence (D-016) | b1 | **pending** | 4h-focused play → 1m panel smooth; switch A/B same session |
| Snap-back (D-017 / TAL-01579) | b2 | **pending** | Sync OFF, paused, drag into history → release holds viewport |
| Order-entry RC-5 (11 rows) | a5+ | **pending** | Appendix C in `T6-step7-rc5-rc6-closure-sweep-report.md` |
| Settings open (step 18) | b105+ | **pending** (local 4/4 only) | Parity rows 4, 9b — real built product |
| Esc / Delete / Objects-Tree (step 19) | b105 | **pending** | Parity rows 5, 6, 8 — honest harness + real mouse |
| RC-6 M1–M3, M5 | any post-land | **pending** | Built-product indicator add/hide/settings/reload |
| RC-3 anchoring phases | any post-land | **pending** | Volume profile, paste, fractional place, label anchor |
| Re-migration parity rows 1–9, 9b, 11 | **combined build only** | **blocked** | `MULTICHART-PARITY-CHECKLIST.md` full pass host + panel B |
| Independent-symbol advance (a1) | a1 | **pending** (weak harness) | PO staging feel — D-014 interim authority |

**Authoritative combined PO session:** one deploy, one build id recorded on host + all panels, full parity checklist + RC-5 appendix + staging rows above — **after** P1–P6 GREEN and Phase 0 frozen.

---

## 5. Open blockers to unfreeze

### 5.1 Must be GREEN / committed / confirmed

| # | Blocker | Owner | Unblocks |
|---|---------|-------|----------|
| 1 | **Lane 4 Phase 0** — 12-row honest RED matrix frozen; `known-failing.json` reconciled | Lane 4 | Phase 1 dispatch |
| 2 | **Re-migration P1→P6** — each phase 10/10 `gate:react` GREEN; `reactParity.knownFailing` empty | Lane 1 + T3 + T1 | Interaction parity |
| 3 | **PO b1 cadence A/B** — finest-TF feel on staging | PO | D-016 closure |
| 4 | **PO b2 snap-back** — TAL-01579 live confirm | PO | D-017 closure |
| 5 | **Combined build cut** — single `BUILD_ID`, `build:live`, I8 mirrors verified | Manager | Deploy |
| 6 | **`MULTICHART-PARITY-CHECKLIST.md` PASS** on combined build id | PO | D-018 #4 lift |
| 7 | **Registry commit** — `fixed_pending_live` for RC-5 + HR-PARITY rows | Manager | Ticket closure |
| 8 | **H-S34, H-S35, H-S44** removed from rollback `knownFailing` after P5 | Lane 4 | Gate honesty |

### 5.2 Parallel / non-blocking but must not collide at cut

| Item | Note |
|------|------|
| T8 `panel-cmd-bridge.js` | T8 cadence landed (`d6d9822f`); P4 keyboard slice needs **serialization window** |
| `chart.js` | D-017 committed (`9462cef3`); P1 zone 2349–2357 disjoint — Lane 1 clear |
| H-S73 FAIL-REAL-BUG | Pre-existing — **not** folded into D-017; separate Lane 2 queue |
| RC-5 #4/#5 replay×order | **still-open** — do not claim fixed at combined cut |
| RC-6 M4 | Optional defer; M1–M3/M5 can ship without M4 |
| RC-3 Phase 5 / M6 | Seventh tranche **after** interaction unfreeze |

### 5.3 Acceptance equation (all required)

```
Phase 0 frozen
  AND P1..P6 committed + gate:react PASS (12/12 honest GREEN)
  AND accumulated staging (a1..b2 slices) in same tree
  AND single BUILD_ID cut + PO parity checklist PASS
  AND no append-after-cut staging
→ deploy freeze lifts
```

---

## References

- `docs/tickets-overhaul/T3-REMIGRATION-PLAN.md`
- `docs/tickets-overhaul/MULTICHART-PARITY-CHECKLIST.md`
- `docs/tickets-overhaul/MANAGER-FINDINGS.md` (D-018, staging lineage)
- `docs/tickets-overhaul/worker-reports/T6-step7-rc5-rc6-closure-sweep-report.md` (RC-5/RC-6 PO appendix)
- `docs/tickets-overhaul/worker-reports/T7-step2-multichart-replay-closure-sweep-READONLY-report.md` (RC-4 → re-migration map)

**Manifest maintenance:** When each re-migration phase lands, add its commit hash to §1.3→§1.1, confirm the phase switch in §2.1, and re-run §5 before requesting combined build cut.
