# T0 Step 7 — RC-4 multichart interaction-parity harness family

## 1. Task + RC

- **Task:** T0 step 7 (Lane 4) — build RED-first RC-4 multichart interaction-parity harness family (H-S45…H-S53) feeding T3 Lane 2 acceptance ahead of fixes.
- **RC:** RC-4 (multichart interaction parity). Harness/tooling only — no engine or React edits.

## 2. What I changed — file by file

| Path | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/interactive-helpers.mjs` | Extended page-object helpers: `frameRectForPanel`, `focusPanelByClick`, `chartCanvasPagePoint`, `armDrawTool`, `drawRectangleViaMouse`, `drawTrendlineViaMouse`, indicator helpers, `commitDrawingStyleInPanel`, `probeDrawingDragPastTile` (mouseleave path), `probePanDragPastTile`; extended parent message probe for `multichart-drawing-selected`. |
| `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs` | Added H-S45…H-S53 scenario functions + `scenarioList()` entries; removed duplicate local `frameRectForPanel` (now imported from helpers). |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | `expectedTests` 44→53; registered H-S45…H-S53 in `knownFailing` with ticket ids. |
| `chart v 1.4/chart/multichart-prod/harness/red-evidence-hs45-hs53-x3.txt` | RED ×3 evidence log for the new family. |
| `homepage/public/chart/multichart-prod/harness/interactive-helpers.mjs` | Byte-identical mirror of canonical harness helper. |
| `homepage/public/chart/multichart-prod/harness/scenarios.mjs` | Byte-identical mirror of canonical harness scenarios. |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | Byte-identical mirror of canonical known-failing baseline. |
| `homepage/public/chart/multichart-prod/harness/red-evidence-hs45-hs53-x3.txt` | Byte-identical mirror of RED evidence log. |

**No other files touched.** Plan-1 scenarios H-S2…H-S44 unchanged except deduped `frameRectForPanel` import. No engine/React/dist edits.

## 3. Kill-switch (I3 + I13)

- **N/A — harness-only task.** No `window.__TALARIA_*` switches introduced. Scenarios drive the existing engine via puppeteer; kill-switch proof remains on fix lanes (T1/T3).

## 4. Proof — RED → GREEN

### Commands

```powershell
cd "chart v 1.4/chart/multichart-prod/harness"
npm run test -- --only=H-S45,H-S46,H-S47,H-S48,H-S49,H-S50,H-S51,H-S52,H-S53 --runs=3
npm run gate
```

### RED evidence (×3 each — all FAIL-REAL-BUG)

Evidence file: `chart v 1.4/chart/multichart-prod/harness/red-evidence-hs45-hs53-x3.txt`

| Scenario | Ticket(s) | Representative CORE failure |
|----------|-----------|----------------------------|
| **H-S45** | TAL-01495 | `A.count=1 B.count=1` — focused-panel draw on independent pair mirrors to host |
| **H-S46** | TAL-01498 | `selected=["…"] expected=[id1,id2]` + `centerDistancePx=0.0` — mouse-placed tools stack; Ctrl-select keeps one |
| **H-S47** | TAL-01499 | `parentMenu=0 B.toolbarVisible=true` — Quick Menu only in iframe, not parent shell |
| **H-S48** | TAL-01500/01501 | `chartActive=1 listActive=0` — indicator list UI absent/mismatched on first open |
| **H-S49** | TAL-01491/01587 | `hasReactGrid=false stillDraggingOutside=false` — no MultichartGrid pointer-capture path in harness host |
| **H-S50** | TAL-01484/01490 | `B.replay frozen while hostReplay advances` after host step-forward without clicking B |
| **H-S51** | TAL-01571 (stub) | PENDING CORE — row 13 contract tracked |
| **H-S52** | TAL-01574 (stub) | PENDING CORE — row 14 contract tracked |
| **H-S53** | TAL-01586 (stub) | PENDING CORE — row 15 contract tracked |

Final summary lines:

```text
FINAL H-S45 FAIL-REAL-BUG … FINAL H-S53 FAIL-REAL-BUG  (all 9 scenarios, 3/3 runs)
```

### GREEN state (T3 fix targets)

| Scenario | GREEN when |
|----------|------------|
| H-S45 | Draw on focused panel B (independent pair) leaves `A.drawingCount===0`, `B.drawingCount>=1` |
| H-S46 | Two mouse-drawn trendlines on B stay separated; Ctrl-select yields both ids once |
| H-S47 | Parent shell exposes Quick Menu chrome (`parentMenu>0`) after panel-B draw |
| H-S48 | Indicator list DOM active count matches chart active count on first open after add |
| H-S49 | `__multichartGrid` participates; drawing drag retains capture past tile + mouseleave |
| H-S50 | After host `stepForward()`, panel B `replayTs` and renders advance without click on B |
| H-S51–53 | Stubs replaced with real assertions per T3 rows 13–15 when owners approved |

### Gate (I9)

```text
[gate] PASS: no new regressions; 15 known-failing tracked.
Regressions: (none)
PASS scenarios: H-S2…H-S33, H-S36, H-S37, H-S38, H-S39, H-S43 (unchanged)
```

Harness inventory: **44 PASS + 15 tracked-red = 59 registered** (was 44 total).

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| **I9** Gate green, tracked reds only | Gate PASS; 0 regressions |
| **I8** Harness trees byte-identical | `fc /b` match on `interactive-helpers.mjs`, `scenarios.mjs`, `known-failing.json` pairs |
| **L1** Production tree only | Edits under `multichart-prod/harness/` only |
| **I11** No mirror-frame policy edits | Not touched |
| **I13** React parity surfaces | H-S47/H-S49 assert parent-shell paths harness currently lacks (documented blind spots) |

## 6. What I did NOT do / limits

- Did **not** modify engine (`chart.js`, `drawing-tools-manager.js`, `MultichartGrid.jsx`) or bump build id.
- Did **not** change existing H-S2…H-S44 assertion logic (only import dedupe for `frameRectForPanel`).
- **H-S49** uses a harness-host proxy for `__multichartGrid` — full TAL-01587 mouseleave proof requires live React multichart (see handoff).
- **H-S48** indicator-list probe uses iframe DOM selectors; harness has no full V9 indicator panel — listActive stays 0 until React UI is mounted in harness or live-confirmed.
- **H-S51–53** are intentional PENDING stubs until T3 rows 13–15 owners are Director-approved.
- Repo documents “7 harness copies”; this checkout has **2 byte-identical pairs** (canonical + `homepage/public`).

## 7. Live-verification handoff

For PO manual confirmation (per `MULTICHART-PARITY-CHECKLIST.md` / `T3-RETEST-CHECKLIST.md`):

1. **H-S45 (TAL-01495):** 2 panels, different symbols, symbol sync OFF. Focus B, draw rectangle. Confirm drawing never flashes on A.
2. **H-S46 (TAL-01498):** 2 panels same symbol. Draw two separated trendlines on B via UI. Ctrl-click both — handles stay distinct.
3. **H-S47 (TAL-01499):** 2 panels. Draw on B — Quick Menu appears immediately at parent/panel chrome (not delayed until extra click).
4. **H-S48 (TAL-01500/01501):** Add indicator on B; open indicator list — ON state matches chart on first click; delete on B, switch to A — no ghost rows.
5. **H-S49 (TAL-01587):** On host tile, drag chart/tool past layout chrome boundary — drag must not die when cursor leaves bounds.
6. **H-S50 (TAL-01490):** Replay paused, pan host, step-forward — B viewport updates without clicking B.

Build id: use current deployed id per Step 0 in `T3-RETEST-CHECKLIST.md`.

## 8. Status

**DONE (proven)** — RED ×3 on H-S45…H-S53; gate GREEN with 15 tracked reds; harness mirrors byte-identical; worker report complete.
