# T3 verify-only pass spec — P2 / P3 / P6 + P4-Esc on combined build

**Authority:** D-021 (ESC-018) — Phases 2, 3, 6 converted to **verify-only**; H-R05 / H-R09 Esc legs verify-only after measurement-artifact revalidation.  
**Purpose:** Anti-idle spec so the combined build can be checked **immediately** when it cuts — before PO parity sign-off.  
**Scope:** Read-only specification only. No product, harness, or registry edits.

---

## 0. Combined-build context

| Field | Requirement |
|-------|-------------|
| **Surface** | Built `dist-v9` MultichartGrid (`mcLayout=2v`) via `ensureBuiltReactStack()` |
| **Build id** | Single `BUILD_ID` from combined cut — asserted on **host** and **every iframe panel** (L1) |
| **Panel B assertion** | `boot.buildIds.frames.B === boot.buildIds.expectedId` on every verify row that touches panel B |
| **Switches** | Combined build defaults: migration fixes **ON** (unset). Do **not** pass `--phase1-off` for verify-only runs |
| **Harness reference** | Hit-coord-fixed `react-parity-lib.mjs` (frozen SHA in `T3-PHASE0-FROZEN-MATRIX.md`) |
| **Runner** | `chart v 1.4/chart/multichart-prod/harness/react-run.mjs` |

### Verify bundle command (dev gate — run immediately after combined cut)

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
node react-run.mjs --runs=10 --only=H-R01,H-R04,H-R05,H-R08,H-R09,H-R13,H-R14
```

**Pass bar:** each listed scenario **10/10 PASS** on the combined `BUILD_ID`.  
**Not sufficient alone for DONE (proven):** PO must still run `MULTICHART-PARITY-CHECKLIST.md` rows 1–9, 9b, 11 on the **same** build id (D-010 / D-012).

---

## 1. Per-row verify assertions (I15 end-state)

### P2 — H-R01 (V9 bar leg)

| Field | Spec |
|-------|------|
| **Phase** | P2 (parent chrome routing) — **verify-only** per D-021 |
| **Parity checklist** | Row **1** (host + panel B) |
| **Scenario** | `hR01` in `react-parity-scenarios.mjs` |
| **Pre-boot L1** | `boot.buildIds.ok`; `boot.boundary.ok` (no parent `__multichartGrid` inside panel B); `boot.iframeBars > 50` |

#### Actuation (real — I15)

| Step | Helper | What it does |
|------|--------|--------------|
| Seed | `seedDrawing(page, panelId, 'trendline')` | Places trendline on real bars via `placeTool` + `reactDefaultTrendlinePoints` |
| Focus | `focusReactPanel(page, panelId)` | `grid.focusPanelById` + real canvas click at iframe-translated coords |
| Disarm | `disarmDrawTool(page, panelId)` | Clears active draw tool so click hits existing drawing |
| Click | `singleClickDrawing(page, panelId, tool.id)` | `drawingHitLocalPoint` → `page.mouse.click` at SVG body hit (not synthetic `dispatchEvent`) |

Runs on **host (`A`)** then **panel B (`B`)**.

#### End-state measured (not proxy)

| Assertion | Helper / signal | Honest green means |
|-----------|-----------------|-------------------|
| Store selection | `waitForReactSelection` → `isDrawingSelected` | `drawingManager.selectedDrawings` contains `tool.id` |
| V9 bar reflects focus | `assertReactMenuState` → `readParentV9BarVisible` | Parent V9 quick-bar visible **only** when `getFocusedPanelId() === panelId`; legacy `#drawing-toolbar` must not be the measured surface |
| Combined | `assertReactMenuState(..., { selectedIds: [tool.id], toolbarVisible: true })` | First real click selects **and** parent chrome shows V9 bar for that panel |

**Invalid proxy greens:** `singleClickDrawing` returned `ok`; DOM row count; iframe toolbar `.visible` without store check.

#### Determinism

- **10/10** on `--runs=10 --only=H-R01`
- Gate on **store id + parent V9 bar for focused panel** — not fixed `sleep()`
- Post hit-coord revalidation: **GENUINELY-GREEN** isolated (`T3-PHASE0-FROZEN-MATRIX.md`)

#### Failure signature → re-escalate P2 to fix-scope (D-021 ruling 2)

| Failure | Evidence to capture | Re-escalation |
|-----------|---------------------|---------------|
| Click dispatches but store empty | `probe: single click dispatched` ok, `CORE: first click selects` fail, `selectedIds=[]` | P2 fix-scope — routing V3 / ownership V2 regression or hit-coord regression |
| Store selects, V9 bar absent on panel B | `storeOk=true`, `v9BarVisible=false` for `panelB` | P2 fix-scope — `MultichartGrid` chrome routing / `onV9Sel` |
| Build id mismatch in panel B | `H-R01 L1: build id` fail | Combined build assembly error — **not** P2 engine fix |
| `findDrawingsAtPoint miss` | `probe` fail before CORE | Lane 4 harness regression — run Phase-1 A/B discriminator first |

---

### P3 — H-R04 (settings open + stay, host + panel B)

| Field | Spec |
|-------|------|
| **Phase** | P3 (settings transport + flash) — **verify-only** |
| **Parity checklist** | Row **4** (host + panel B) |
| **Scenario** | `hR04` |

#### Actuation

| Step | Helper | What it does |
|------|--------|--------------|
| Setup | `seedDrawing` → `singleClickDrawing` → `waitForReactSelection` → `waitForV9QuickBarReady` | Selected rectangle on real bars |
| Open | `doubleClickDrawing(page, panelId, tool.id)` | Real `page.mouse.click` `clickCount: 2` at drawing center hit |

Both **host** and **panel B**.

#### End-state measured

| Assertion | Helper | Honest green means |
|-----------|--------|-------------------|
| Real settings modal | `waitForParentDrawingSettingsOpen(page, 5000)` | `readParentReactSettings`: `open && !quickBarShellOnly && hasStyleSection` |
| Style section | `hasStyleSection` | Parent `#multichart-global-settings-root` (or equivalent) contains style UI text — **not** V9 gear shell alone |

**Invalid proxy greens:** quick-bar gear visible only; `settingsWait.ok` with `quickBarShellOnly=true`; synthetic `openDrawingSettings` evaluate without dbl-click.

#### Determinism

- **10/10** `--only=H-R04`
- Full-suite occasional panel-B flake documented as harness/session — **isolated 10/10 is the verify bar**; any isolated fail → re-escalate

#### Failure signature → re-escalate P3

| Failure | Evidence | Re-escalation |
|-----------|----------|---------------|
| Dbl-click ok, settings never open | `probe` ok, `CORE: settings open` fail, `hasStyleSection=false` | P3 fix-scope — `multichart-open-drawing-settings` transport / `openDrawingSettingsForPanel` |
| Settings flash-close | Immediate open ok, 400ms later closed (see H-R13) | P3 fix-scope — settings-flash V2 race |
| Panel B only fails | host pass, panelB fail | iframe postMessage path or panel focus guard regression |

---

### P3 — H-R13 (panel-B settings flash / stay open)

| Field | Spec |
|-------|------|
| **Phase** | P3 — **verify-only** (burned-fix variant) |
| **Parity checklist** | Row **4** panel-B emphasis (no flash) |
| **Scenario** | `hR13` — panel B only |

#### Actuation

| Step | Helper |
|------|--------|
| Focus B | `focusReactPanel(page, 'B')` |
| Seed | `seedDrawing(page, 'B', 'trendline')` |
| Open | `doubleClickDrawing(page, 'B', tool.id)` |

#### End-state measured

| Assertion | Timing | Honest green means |
|-----------|--------|-------------------|
| Immediate open | `waitForParentDrawingSettingsOpen` right after dbl-click | `hasStyleSection=true` |
| No flash-close | `sleep(400)` then `readParentReactSettings` | Still `open && hasStyleSection` — settings **stay** open ≥400ms |

**Invalid proxy greens:** passing immediate check only; asserting gear DOM without `hasStyleSection`.

#### Determinism

- **10/10** `--only=H-R13`
- Timing gate: 400ms observation window (scenario-defined) — failure if race closes modal in that window

#### Failure signature → re-escalate P3

| Failure | Evidence |
|-----------|----------|
| `CORE: settings still open after 400ms` fail | Paste `readParentReactSettings` JSON — `open=false` or `quickBarShellOnly=true` |
| Immediate fail | Transport never opened — same as H-R04 panel-B path |

---

### P6 — H-R08 (Ctrl+drag marquee, host + panel B)

| Field | Spec |
|-------|------|
| **Phase** | P6 (iframe marquee) — **verify-only** |
| **Parity checklist** | Row **8** (host + panel B) |
| **Scenario** | `hR08` |

#### Actuation

| Step | Helper | What it does |
|------|--------|--------------|
| Seed | `placeTool` ×2 trendlines at offset coords | Two enclosed drawings on real bars |
| Clear selection | `dm.deselectAll()` in frame | Marquee starts from empty selection |
| Marquee | `ctrlDragMarquee(page, panelId)` | `page.keyboard.down('Control')` + real `page.mouse` down/move/up across iframe-translated canvas corners (0.12,0.18)→(0.78,0.82) |

#### End-state measured

| Assertion | Helper | Honest green means |
|-----------|--------|-------------------|
| Marquee active during drag | `readCtrlMarqueeState` via `drag.during` | `ctrlMarqueeSelect.active && w>8 && h>8` |
| Store multi-select | `waitForReactSelection(page, pid, [t1.id, t2.id])` + `isDrawingSelected` ×2 | **Both** drawing ids in `selectedDrawings` |

**Invalid proxy greens:** drag dispatched only; blue border without store ids; single-id selection.

#### Determinism

- **10/10** `--only=H-R08`
- Gate on **two store ids** after drag — not marquee DOM alone

#### Failure signature → re-escalate P6

| Failure | Evidence |
|-----------|----------|
| Marquee draws, store single/empty | `during` ok, `marquee multi-selects` fail |
| No marquee during drag | `during.active=false` — pointer capture / Ctrl routing |
| Host pass, panel B fail | iframe marquee path regression (Phase 6 target surface) |

---

### P6 — H-R14 (panel-B iframe marquee burned-fix)

| Field | Spec |
|-------|------|
| **Phase** | P6 — **verify-only** |
| **Parity checklist** | Row **8** panel-B emphasis |
| **Scenario** | `hR14` — panel B only |

#### Actuation

Same as H-R08 but tools placed only in **panel B** via `placeTool(page, 'B', ...)`; `ctrlDragMarquee(page, 'B')`.

#### End-state measured

Identical store contract: both trendline ids selected in panel B `drawingManager.selectedDrawings`; marquee `during.w/h > 8`.

#### Determinism

- **10/10** `--only=H-R14`

#### Failure signature → re-escalate P6

Panel-B-only failure with host H-R08 passing → iframe-specific marquee / focus regression.

---

### P4-Esc — H-R05 (Esc closes settings + deselects)

| Field | Spec |
|-------|------|
| **Phase** | P4 Esc leg — **verify-only** (Delete leg H-R06 remains implement) |
| **Parity checklist** | Row **5** |
| **Scenario** | `hR05` |

#### Actuation

| Step | Helper |
|------|--------|
| Open settings | `singleClickDrawing` → `doubleClickDrawing` → `waitForParentDrawingSettingsOpen` |
| Esc | `pressEscapeReact(page, panelId)` — real `page.keyboard.press('Escape')` after `focusReactPanel` |

Host + panel B.

#### End-state measured

| Assertion | Helper | Honest green means |
|-----------|--------|-------------------|
| Store deselect | `isDrawingSelected` false | Drawing not in `selectedDrawings` |
| Settings closed | `readParentReactSettings` | `!parent.open && !parent.hasStyleSection` |

**Invalid proxy greens:** Esc dispatched; toolbar hidden but store still selected.

#### Determinism

- **10/10** `--only=H-R05`

#### Failure signature → re-escalate P4-Esc (not Delete)

| Failure | Evidence |
|-----------|----------|
| Settings close, store still selected | `Esc closes settings` ok, `Esc deselects` fail |
| Store deselect, settings orphaned | `hasStyleSection` still true |

---

### P4-Esc — H-R09 Esc legs (single→dbl chain + Esc)

| Field | Spec |
|-------|------|
| **Phase** | P3 settings leg + P4 Esc leg — settings part overlaps H-R04; **Esc legs verify-only** |
| **Parity checklist** | Row **9** |
| **Scenario** | `hR09` |

#### Actuation chain

1. `singleClickDrawing` → `assertReactMenuState` (select + V9 menu)  
2. `doubleClickDrawing` → `waitForParentDrawingSettingsOpen` (`hasStyleSection`)  
3. `pressEscapeReact`

Host + panel B.

#### End-state measured (Esc verify slice)

| Assertion | Honest green |
|-----------|--------------|
| `H-R09 CORE: Esc deselects after chain (store)` | `!isDrawingSelected` |
| `H-R09 CORE: Esc closes settings after chain` | `!parent.open && !parent.hasStyleSection` |

Settings legs in same scenario must also pass for chain validity (re-escalate P3 if dbl-click/settings fail before Esc).

#### Determinism

- **10/10** `--only=H-R09`
- Full-suite host store flake noted in frozen matrix — **isolated 10/10** is verify bar

#### Failure signature

Esc fail after settings open → P4-Esc fix-scope. Settings fail earlier in chain → P3 fix-scope.

---

## 2. D-021 unfreeze gate cross-check (12 rows — nothing silently dropped)

D-021 criterion **#2** and **#3** require verify-only rows **and** full matrix on combined build.

| Row | Phase | Combined-build role | In verify bundle? | Still required at unfreeze? |
|-----|-------|---------------------|-------------------|----------------------------|
| **H-R01** | P2 | Verify-only | ✅ `--only` list | ✅ Gate row |
| **H-R02** | P1 | P1 committed — substrate | — (run with P1 gate) | ✅ 12-row matrix |
| **H-R03** | P1 | P1 committed — substrate | — (run with P1 gate) | ✅ 12-row matrix |
| **H-R04** | P3 | Verify-only | ✅ | ✅ Gate row |
| **H-R05** | P4-Esc | Verify-only | ✅ | ✅ Gate row |
| **H-R06** | P4-Delete | **IMPLEMENT** (Lane 1) | — | ✅ Must go GREEN via fix |
| **H-R07** | P5 | **IMPLEMENT** (Lane 2) | — | ✅ Must go GREEN via fix |
| **H-R08** | P6 | Verify-only | ✅ | ✅ Gate row |
| **H-R09** | P3+P4-Esc | Verify-only (full scenario) | ✅ | ✅ Gate row |
| **H-R12** | P2 (gear) | Dropped green — still in matrix | ⚠️ Add `--only=H-R12` to full gate | ✅ 12-row matrix |
| **H-R13** | P3 | Verify-only | ✅ | ✅ Gate row |
| **H-R14** | P6 | Verify-only | ✅ | ✅ Gate row |

### Full 12-row combined gate command (after H-R06 + H-R07 land)

```bash
node react-run.mjs --runs=10 --only=H-R01,H-R02,H-R03,H-R04,H-R05,H-R06,H-R07,H-R08,H-R09,H-R12,H-R13,H-R14
```

**Empty `reactParity.knownFailing`** + above **10/10** = harness unfreeze criterion. Verify-only bundle is a **subset** runnable **before** H-R06/H-R07 land to confirm no regression on green rows.

### D-021 six criteria mapped

| # | Criterion | Satisfied by |
|---|-----------|--------------|
| 1 | P1 + P4-Delete + P5 green 10/10 | H-R02,H-R03,H-R06,H-R07 + switch-OFF A/B (not verify-only doc) |
| 2 | P2/P3/P6 verify-only pass | Section 1 bundle + §2 table |
| 3 | Full 12-row matrix, build id in panel B | Full gate command + L1 checks per scenario |
| 4 | Accumulated staging folded | §3 dependencies |
| 5 | H-S34/35/44 promoted | P5 implement — outside verify-only |
| 6 | PO parity checklist same build | Manual — after harness green |

---

## 3. Combined-build dependencies (accumulated staging)

Verify-only rows assume the **combined cut** includes fixes that were green on fallback-B after hit-coord correction. If a row fails on combined build, check whether a dependency failed to fold.

| Verify row | Depends on in combined build | Notes |
|------------|------------------------------|-------|
| **H-R01** | P1 engine substrate (`__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` unset); hit-coord harness; optional P2 routing if explicitly enabled in cut | Store select must work before V9 bar assertion |
| **H-R04 / H-R13** | Settings transport (`multichart-open-drawing-settings`); settings-flash V2; quickbar-settings fix family | b105 settings slice if in manifest |
| **H-R08 / H-R14** | P1 multi-select store; iframe `ctrlMarqueeSelect` path; chart pointer/marquee in embed | H-R14 is panel-B-specific path |
| **H-R05 / H-R09 Esc** | Keyboard bridge / parent Esc forwarder (verify-only — was measurement artifact) | Must **not** conflate with H-R06 Delete implement |
| **All rows** | Single `BUILD_ID`; `dist-v9` rebuilt; I8 mirrors; Phase-1 commit in tree | Build id assert fails → fix manifest, not phase |
| **Staging smoke (non-blocking verify bundle)** | cadence `d6d9822f`, snap-back `9462cef3`, order-entry A6-1, RC-6 M4 `ca35d176`, TF-label | Failures here do not excuse interaction verify fails — parallel PO rows |

**Explicit non-dependencies:** Verify-only rows do **not** require H-R06 Delete fix or H-R07 peer-isolation fix to pass (those are separate implement gates). They **do** require P1 substrate in the combined tree.

---

## 4. Re-escalation protocol (D-021 ruling 2)

When any verify-only row fails **10/10** on combined build:

1. **Capture:** full `react-run` log for failing row; last failing `CORE` check label + detail JSON; `boot.buildIds`; combined `BUILD_ID`.
2. **Classify:** harness regression (probe/L1 fail) vs product regression (CORE fail with probe ok).
3. **File:** Manager escalation — phase reverts from verify-only to **fix-scope** for that phase only.
4. **Do not** silently re-dispatch P2/P3/P6 engine mechanisms unless verify fail proves regression.

---

## 5. PO mirror (same build id)

After harness verify bundle passes, PO runs checklist rows **1, 4, 5, 8, 9** on host + panel B — matching H-R01, H-R04/H-R13, H-R05/H-R09, H-R08/H-R14. Record build id on host + every panel frame before starting.

---

## References

- `docs/tickets-overhaul/DIRECTOR-DECISIONS.md` — D-021
- `docs/tickets-overhaul/T3-PHASE0-FROZEN-MATRIX.md` — per-row genuine-green verdicts
- `docs/tickets-overhaul/T3-REMIGRATION-PLAN.md` — phase mechanisms
- `docs/tickets-overhaul/T3-COMBINED-BUILD-MANIFEST.md` — fold list
- `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` — scenario implementations
- `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` — actuation helpers
