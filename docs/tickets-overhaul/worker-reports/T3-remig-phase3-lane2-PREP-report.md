# T3 Re-migration Phase 3 PREP — settings transport + apply design (READ-ONLY)

**Task:** `T3-remig-phase3-lane2-PREP-readonly.md`  
**Type:** Read-only design — no product/React/harness edits  
**Date:** 2026-07-16  
**RC:** RC-1 / RC-4 **Group C** (settings transport + flash persistence) — design only; fix not started.

**Ready to implement Phase 3 on Phase-2-GREEN go.**

---

## 1. Task + RC

| Field | Value |
|-------|-------|
| Task id | T3 re-migration Phase 3 PREP (Lane 2) |
| Goal | Design settings-open + settings-apply I14 transport, master slice switch, honest RED→GREEN spec |
| RC | **RC-1 / RC-4 Group C** — discharges frozen-matrix rows **H-R04**, **H-R13**; **H-R09** settings leg |
| Authority | `T3-REMIGRATION-PLAN.md` Phase 3 + `T3-PHASE0-FROZEN-MATRIX.md` (frozen 2026-07-16) |

**Matrix correction vs prompt wording:** Phase 3 does **not** own **H-R08** (Ctrl+drag marquee — **Phase 6**). Frozen P3 rows are **H-R04**, **H-R13**, and the **settings leg** of **H-R09**. **H-R12** is **GENUINELY-GREEN-ON-FALLBACK** on b1 (gear opens modal) — out of P3 discharge; P3 still aligns **dbl-click** and **flash-persist** with the same transport.

---

## 2. What I changed — file by file

| Path | Change |
|------|--------|
| `docs/tickets-overhaul/worker-reports/T3-remig-phase3-lane2-PREP-report.md` | **Created** — this report |

**No product, React, harness, or registry files touched.**

---

## 3. Kill-switch (I3 + I13) — Phase 3 design

### Master slice (mandatory per D-018 #2 — new knob; do NOT extend P1/P2 masters)

| Switch | Default after Phase 3 lands | Meaning |
|--------|----------------------------|---------|
| `window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE3_SETTINGS` | **unset** (= Phase 3 ON) | One-knob revert: `true` restores fallback-B settings transport posture |

### Child predicates (retained — granular revert within phase; I13 audit)

| Switch | Scope today | Phase 3 role |
|--------|-------------|--------------|
| `__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` | Iframe open path (`requestMultichartParentDrawingSettings`, postMessage, gear route gates) | **Open transport** — default ON when master unset |
| `__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V2` | Flash-close race (`clearDrawingUiOnOtherPanels` guard, `closeDrawingSettingsPreservingSource`) | **Persist transport** — default ON when master unset |

**Naming debt (fix in implementation):** `multichartSettingsFlashFixEnabled()` in `MultichartGrid.jsx:62–68` currently reads **`QUICKBAR_SETTINGS_FIX_V2`**, not `SETTINGS_FLASH_FIX_V2`. Phase 3 impl must **split predicates correctly** so master OFF reverts **both** open and flash paths independently (I13).

### Proposed predicate logic (implementation contract)

```javascript
function _isMcRemigrationPhase3SettingsSliceActive() {
    if (typeof window === 'undefined') return true;
    return !window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE3_SETTINGS;
}

function multichartQuickbarSettingsTransportEnabled() {
    if (!_isMcRemigrationPhase3SettingsSliceActive()) return false;
    return !(typeof window !== 'undefined'
        && window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2);
}

function multichartSettingsFlashFixEnabled() {
    if (!_isMcRemigrationPhase3SettingsSliceActive()) return false;
    return !(typeof window !== 'undefined'
        && window.__TALARIA_DISABLE_MULTICHART_SETTINGS_FLASH_FIX_V2);
}
```

Mirror in `drawing-tools-manager.js` (`multichartQuickbarSettingsFixEnabled`) and `TalariaV8bLive.jsx` (`v9QuickBarPanelSettingsFixEnabled` ~5044) — **byte-sync policy** with master gate.

### React / I13 file coverage

| File | Gated paths |
|------|-------------|
| `MultichartGrid.jsx` | `openDrawingSettingsForPanel`, `clearDrawingUiOnOtherPanels` flash guard, `multichart-open-drawing-settings` handler, `closeDrawingSettingsPreservingSource` |
| `TalariaV8bLive.jsx` | `v9OpenQuickBarSettingsViaEditDrawing`, `__v9OpenDrawingSettings` hook, tlStyle apply bridge (~21502+) |
| `drawing-tools-manager.js` | `requestMultichartParentDrawingSettings`, dbl-click open, `multichartQuickbarSettingsFixEnabled` gates |
| `drawing-tools-ui.js` | Legacy modal postMessage open (~451–474) — gate on quickbar transport predicate |
| `panel-cmd-bridge.js` | **No Phase 3 edits** (Esc/Delete ~5870–5923 = Phase 4) |
| `chart.js` | **No Phase 3 edits** (P1 / D-017 / TF regions) |

---

## 4. Proof — RED → GREEN (Phase 3 targets)

### Prerequisites

- Phase 0 frozen matrix (**done** — `T3-PHASE0-FROZEN-MATRIX.md`)
- Phase 1 GREEN: H-R02, H-R03 **10/10**; H-R01 store leg green
- Phase 2 GREEN: H-R01 **V9 bar leg** **10/10** (H-R12 dropped — already green on b1)

### Frozen authoritative rows (Phase 3)

| Row | Symptom | Phase |
|-----|---------|-------|
| **H-R04** | Dbl-click does not open real parent settings modal | **P3** |
| **H-R13** | Panel-B dbl-click — settings flash-close within 400ms | **P3** |
| **H-R09** | Select → settings → Esc chain — **settings leg** only | **P2+P3+P4** |

### Honest harness commands (built `dist-v9`, fallback-B default)

```text
cd "chart v 1.4/chart/multichart-prod/harness"
node react-run.mjs --only=H-R04,H-R13
# Phase 3 master A/B:
node react-run.mjs --bug --bugSwitches=__TALARIA_DISABLE_MC_REMIGRATION_PHASE3_SETTINGS --only=H-R04,H-R13
```

**Lane 4 hook (propose):** `REACT_PARITY_PHASE3_OFF=1` / `--phase3-off` sets master `true` (mirrors `--phase1-off` pattern in frozen matrix §Harness A/B).

| Row | Actuation (I15) | Measures (end-state) | Phase 3 GREEN criterion |
|-----|-----------------|----------------------|-------------------------|
| **H-R04** | Real `doubleClickDrawing` on host **and** panel B after trendline placed (`react-parity-scenarios.mjs:146–163`) | `waitForParentDrawingSettingsOpen`: `open && !quickBarShellOnly && **hasStyleSection**` (regex `\bstyle\b` in parent `#multichart-global-settings-root` — **not** toolbar shell proxy) | **10/10** host + panel B |
| **H-R13** | Real panel-B dbl-click only (`:432–449`) | Immediate open + `readParentReactSettings` after **400ms** still `open && hasStyleSection` | **10/10** — no flash-close race |
| **H-R09** (settings leg) | Real single-click → dbl-click (Esc deferred to P4) | Settings leg: `hasStyleSection` before Esc | GREEN when P2 select + P3 open both pass |

### Settings-apply honest spec (coordinate with Lane 4 — **not** in current gate)

| Proposed id | Actuation | Measure | Notes |
|-------------|-----------|---------|-------|
| **H-R04-APPLY** (register) | After H-R04 GREEN: real click parent settings **line-color** control (not synthetic DOM dispatch) | `page.evaluate` in **panel B iframe**: selected drawing `style.color` (or SVG stroke) matches chosen swatch | Proves parent→iframe apply bridge (`TalariaV8bLive` tlStyle bridge ~21502+) |
| **Gear apply** | Real `#tl-sett` click after panel-B select (H-R12 already green) | Same color measure | Regression guard only — not a P3 discharge row |

**I15 rule:** `quickBarShellOnly` / `toolbarVisible` alone = **invalid** green. `hasStyleSection` + persisted open = valid open. Apply = **visible drawing mutation** in source iframe.

**Switch A/B:** Master `true` → H-R04/H-R13 **RED**; child `QUICKBAR` only → open path inert (dbl-click no modal); child `SETTINGS_FLASH` only → immediate open then flash-close (H-R13 RED).

**Determinism:** **10/10** per `T3-REMIGRATION-PLAN` §2 Phase 3.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| READ-ONLY | No product/harness/registry edits |
| I14 | All cross-boundary state via `postMessage` + `CustomEvent` — no parent globals in iframe selection paths; `__multichartGrid` / `__v9OpenDrawingSettings` are **documented parent APIs** (same-origin), not shared closures in iframe |
| I13 | Master + two child switches; every open/flash/apply path listed in §3 |
| D-018 #2 | Dedicated `__TALARIA_DISABLE_MC_REMIGRATION_PHASE3_SETTINGS` — does not extend P1/P2 masters |
| D-018 #3 | `panel-cmd-bridge.js` keyboard window untouched |
| Frozen matrix | Row ids confirmed against `T3-PHASE0-FROZEN-MATRIX.md` §10 authoritative REDs |

---

## 6. What I did NOT do / limits

- No `dist-v9` rebuild or harness run — design references source + frozen b1 baseline.
- **H-R12** not re-tested — matrix adjudicates green; P3 does not re-fix gear route unless PO regression filed.
- **Settings-apply** harness row **H-R04-APPLY** proposed only — Lane 4 must register before claiming apply proven.
- **Phase 4** Esc/Delete parent forwarders in `MultichartGrid.jsx:5870–5923` intentionally **out of scope** — currently gated on `multichartSettingsFlashFixEnabled()` (wrong switch name); P4 should use **`__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1`** and decouple from P3 predicates.
- Uncommitted `drawing-tools-ui.js` (+6, T6 M3) — orthogonal; do not fold into P3 commit.

---

## 7. Live-verification handoff

After Phase 3 impl (post P2 GREEN) on combined build:

1. Build id in host + panel B iframe.
2. Multichart 2v, Phase 3 master **unset**, P1+P2 masters unset.
3. **Panel B:** place trendline → **double-click** → parent settings modal with **Style** section stays open ≥1s.
4. Change line color in modal → trendline color updates on **panel B** without extra click.
5. Kill-switch: `window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE3_SETTINGS=true` + reload → dbl-click does not open modal (H-R04 RED repro).

---

## 8. Status

**DIAGNOSTIC-ONLY** — transport map, master switch, RED spec, and collision map complete.

**Ready to implement Phase 3 on Phase-2-GREEN go.**

---

## 9. Settings-open + settings-apply transport map (I14)

### 9.1 Open path (iframe → parent React settings surface)

```mermaid
sequenceDiagram
    participant IF as Panel B iframe
    participant DM as drawing-tools-manager
    participant PG as MultichartGrid parent
    participant V9 as TalariaV8bLive

    Note over IF,DM: Path A — double-click
    IF->>DM: openDrawingSettingsFromDoubleClick(event)
    DM->>DM: selectDrawing + armMultichartParentSettingsOpenGuard
    DM->>PG: postMessage multichart-open-drawing-settings
    Note over DM,PG: fallback: parent.__multichartOpenShapeSettings / grid.openDrawingSettingsForPanel

    Note over PG: Path B — gear (already green H-R12; same transport)
    V9->>PG: grid.openDrawingSettingsForPanel(panelId, drawing, x, y)

    PG->>PG: arm __v9DrawingSettingsOpenGuardUntil + source
    PG->>PG: clearDrawingUiOnOtherPanels (flash guard: preserve source)
    PG->>V9: __v9OpenDrawingSettings(drawing, x, y)
    V9->>V9: Render #multichart-global-settings-root (hasStyleSection)
```

| Step | File:region | Event / API |
|------|-------------|-------------|
| 1 | `drawing-tools-manager.js:2157–2331` | `openDrawingSettingsFromDoubleClick` — dbl-click on drawing hit |
| 2 | `drawing-tools-manager.js:173–183` | `armMultichartParentSettingsOpenGuard` — parent perf guard |
| 3 | `drawing-tools-manager.js:185–266` | `requestMultichartParentDrawingSettings` — payload `multichart-open-drawing-settings` |
| 4 | `drawing-tools-ui.js:451–474` | Legacy modal path — duplicate postMessage (must stay gated) |
| 5 | `MultichartGrid.jsx:6482–6500` | `message` handler → `openDrawingSettingsForPanel` |
| 6 | `MultichartGrid.jsx:5219–5340` | `openDrawingSettingsForPanel` — resolve iframe dm, `v9Open(drawing)` |
| 7 | `TalariaV8bLive.jsx:5088–5133` | `v9OpenQuickBarSettingsViaEditDrawing` — gear → same `openDrawingSettingsForPanel` |
| 8 | `TalariaV8bLive.jsx:20741` | `window.__v9OpenDrawingSettings` hook registration |

**Phase 2 dependency (must be GREEN before P3):**

| Prerequisite | Why |
|--------------|-----|
| `multichart-drawing-selected` + `focusPanelById` (P2) | `openDrawingSettingsForPanel` uses `focusedPanelIdRef` / source panel resolution |
| `__v9DrawingSelectionGuardUntil` (P2) | Prevents peer-clear from racing open on same tick as select |
| Phase 1 store select on dbl-click | `openDrawingSettingsFromDoubleClick` requires selected drawing in iframe store |

Without P2, dbl-click may fire postMessage but parent lacks focused panel context → H-R04 RED persists even with P3 flash fix.

### 9.2 Apply path (parent settings → iframe drawing end-state)

| Step | File:region | Behavior |
|------|-------------|----------|
| 1 | `TalariaV8bLive.jsx:21502–21590` | `tlStyle` / settings controls → `collectV9BridgeTargets()` |
| 2 | `TalariaV8bLive.jsx:21517–21550` | `editingDrawingRef` scopes apply to **one** drawing (not all tiles) |
| 3 | Bridge | `enumerateV9DrawingManagersFromWindow()` → resolve **source panel** `dm` |
| 4 | `dm.renderDrawing(d)` + `dm.saveDrawings()` | Visible stroke/style mutation in iframe |
| 5 | `MultichartGrid.jsx:5361–5366` | Legacy `settingsPanel.show` callback — same `dm` on **source** tile |

**Apply is parent-authoritative, iframe-rendered:** no iframe `postMessage` for apply — parent reaches iframe `dm` via same-origin `contentWindow.chart.drawingManager` enumeration. I14 satisfied (no iframe reading parent selection globals).

### 9.3 Close path (parent → iframe cleanup)

| Step | File:region | Event |
|------|-------------|-------|
| 1 | `drawing-tools-manager.js:268–284` | `requestMultichartParentCloseDrawingSettings` → `multichart-close-drawing-settings` |
| 2 | `MultichartGrid.jsx` | `closeDrawingSettingsForPanel` / `closeDrawingSettingsOnAllPanels` |
| 3 | P4 (future) | Parent Esc → `onParentDismissDrawingKey` ~5870 — **serialize to P4**, decouple switch from P3 master |

---

## 10. File line-region map + collision check

| File | Phase 3 touch zones | Avoid / serialize |
|------|---------------------|-------------------|
| `MultichartGrid.jsx` | **62–68** predicates (split + master); **5074–5213** `clearDrawingUiOnOtherPanels` flash guard; **5219–5380** `openDrawingSettingsForPanel`; **6482–6500** settings postMessage handler; **5865–5867** `__multichartOpenShapeSettings` export | **2479–2491, 5539–5848** D-016 cadence (T8); **6393–6480** P2 selection handler (adjacent — one PR, touch both only if P2 already landed); **5870–5923** **Phase 4 keyboard** — do not extend for P3 |
| `TalariaV8bLive.jsx` | **5025–5140** gear/settings open helpers; **20741** `__v9OpenDrawingSettings`; **21502–21620** style apply bridge; **31541–31569** `#tl-sett` gear onClick | Billing/order-entry regions |
| `drawing-tools-manager.js` | **100–284** postMessage open/close; **2157–2331** dbl-click open; **10345–10402** gear/editDrawing routes | P1 lifecycle predicates (~tool-lifecycle) — read-only |
| `drawing-tools-ui.js` | **380–505** global settings root; **451–474** postMessage open | T6 M3 uncommitted lines — separate commit |
| `panel-cmd-bridge.js` | **No edits** | **562–574, 1974–1998** D-016 replay cadence; **2418+** `setTimeframe`; **Phase 4** delete/Esc cmd cases |
| `chart.js` | **No edits** | **2349–2357** P1; **2456–2526, 17296–17357** D-017; **21157–22291** TF switch (T8 diagnostic queue) |

**Phase 4 keyboard window (D-018 #3):** `MultichartGrid.jsx:5870–5923` and `panel-cmd-bridge.js` keyboard/delete cmd dispatch — **must not** be modified during P3 PR. P3 may arm guards that P4 Esc relies on (`__v9DrawingSettingsOpenGuardUntil`) — document handoff, do not tighten Esc path under P3 switch.

**Replay / TF regions:** No `replay-system.js` or `panel-cmd-bridge` replay bus edits in P3.

---

## 11. Phase 2 dependency summary

| P2 delivers | P3 consumes |
|-------------|-------------|
| H-R01 V9 bar visible on panel select | User can select then dbl-click / gear with correct focus |
| `focusPanelById(source)` on `multichart-drawing-selected` | `openDrawingSettingsForPanel` resolves correct `sourceId` |
| `talaria:v9-selected-drawing` with `panelId` | V9 `onV9Sel` + gear `panelId` resolution |
| Selection guard `__v9DrawingSelectionGuardUntil` | Reduces flash-close from peer-clear racing open |

**H-R09 composite:** cannot go GREEN until **P2 (select) + P3 (settings open) + P4 (Esc)** — P3 is the middle leg.

**H-R12 (dropped):** gear→modal already green on b1 — P3 must **not regress** H-R12 while fixing H-R04/H-R13; run H-R12 as regression fence in same `gate:react` session.

---

## 12. Lane 4 coordination

| Item | Lane 4 action |
|------|---------------|
| Frozen rows | **H-R04**, **H-R13** in `known-failing.json` (10-row set) — confirmed |
| `--phase3-off` hook | Wire alongside `--phase1-off` for master A/B |
| **H-R04-APPLY** | Register optional apply row when parent color→iframe stroke proof needed |
| Gate | After P3 impl: `gate:react` PASS with 10→8→6… failing count per phase GREEN |
| I15 audit | Reconfirm `waitForParentDrawingSettingsOpen` uses `hasStyleSection`, not shell proxy |

---

## 13. Summary

| Item | Result |
|------|--------|
| Frozen P3 rows | **H-R04**, **H-R13**, **H-R09** settings leg (not H-R08) |
| Master switch | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE3_SETTINGS` |
| Child switches | `QUICKBAR_SETTINGS_FIX_V2` (open), `SETTINGS_FLASH_FIX_V2` (persist) — fix predicate split |
| Transport | Open: postMessage + `openDrawingSettingsForPanel` → `__v9OpenDrawingSettings`; Apply: V9 bridge → iframe `dm.renderDrawing` |
| P2 dependency | Focus + selection guard before settings open |
| Collisions | No `panel-cmd-bridge` / `chart.js` / replay cadence edits |
| Gate phrase | **Ready to implement Phase 3 on Phase-2-GREEN go** |
