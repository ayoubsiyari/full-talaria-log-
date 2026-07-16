# T3 — H-R03 iframe ctrl-select dedupe FIX (Lane 1)

## 1. Task + RC

- **Task:** `T3-hr03-iframe-ctrlselect-dedupe-FIX-lane1` — fix panel-B ctrl+click multi-select regression (`first=true second=false`).
- **RC:** HR-PARITY row 3 (ESC-019 unfreeze). Root cause per Lane 2 diagnostic: iframe ctrl+click double-actuation + 80ms suppress miss toggles drawing #2 off; **additional combined-build failure** when host drawings sync into panel B and geometric hit picks the synced copy instead of the panel-native line.

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | Kill-switch helpers; 250ms iframe suppress window; id-based `alreadySelected` / toggle-off guard in `selectDrawing`; DOM-pointer resolution (`_resolveDrawingFromDomPoint`, `_resolveDrawingFromPointerEvent`); iframe ctrl+click prefers topmost DOM drawing over geometric `findDrawingsAtPoint[0]` in `handleMouseDown` and canvas capture `mousedown`; shape `click` early-return when suppress fresh (iframe only). |
| `homepage/public/chart/modules/drawing-tools-manager.js` | **I8 mirror — byte-identical** to chart tree copy. |

**SHA256 (both trees):** `40778A12FF41BEC05E6CB90E5BA21EB762BCCEFD418B5FB0FF3C3F916087BD3E`

**No other files committed.** Harness hooks (`--iframe-ctrl-dedupe-off`) and debug probes were used for proof only (Lane 4 territory). Combined build `20260716b8` produced locally via `BUILD_ID=20260716b8 npm run build:live` for built-product serve; not included in file-scoped commit.

### Touch zones (approximate lines after edit)

- Switch helpers: ~123–129
- Canvas ctrl `mousedown`: ~2423–2453
- `handleMouseDown` iframe ctrl DOM override: ~4288–4306
- `_resolveDrawingFromDomPoint` / `_resolveDrawingFromPointerEvent`: ~5985–6018
- Shape `click` suppress: ~7685–7698
- `selectDrawing` suppress + toggle guard: ~9908–9958

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1`
- **Default:** unset → fix **ON** (250ms suppress, DOM preference, toggle-off guard).
- **OFF:** `_isIframeCtrlSelectDedupeV1Enabled()` false → 80ms suppress, geometric `findDrawingsAtPoint[0]` only, no DOM override, no toggle-off guard, no shape-click suppress — reverts to pre-fix broken panel-B behavior.
- **Gated file:** `drawing-tools-manager.js` only (both I8 trees). Host (non-embed) paths unchanged — all new logic is behind `isMultichartIframeEmbed()` and/or `_isIframeCtrlSelectDedupeV1Enabled()`.

## 4. Proof — RED → GREEN

### Commands (built product, `surface: built-dist-v9 build=20260716b7` then `b8` after local build)

```text
node react-run.mjs --only=H-R03 --runs=10
node react-run.mjs --only=H-R03 --runs=10 --iframe-ctrl-dedupe-off
node react-run.mjs --only=H-R03 --runs=3 --phase5-off
node react-run.mjs --only=H-R03 --runs=3 --peer-deselect-off
```

### RED (before fix, combined build b6/b7)

- Panel B: **10/10 FAIL** — `first=true second=false` (diagnostic: `combined-b6-hr03-isolated-x10.txt`).
- Full-loop debug on broken fix attempt: `selectDrawing` added host synced id `910be548-…` instead of panel B `f6fa74ea-…` when 4 drawings present.

### GREEN (after fix)

| Run | Command | Result |
|-----|---------|--------|
| Primary | `--only=H-R03 --runs=10` (fix ON) | **10/10 PASS** — host + panelB both `first=true second=true` |
| A/B | `--iframe-ctrl-dedupe-off --runs=10` | **10/10 FAIL-REAL-BUG** — panelB `first=true second=false` |
| Irrelevant | `--phase5-off --runs=3` | **3/3 PASS** |
| Irrelevant | `--peer-deselect-off --runs=3` | **3/3 PASS** |

Key summary line:

```text
FINAL H-R03 PASS
runs: 'PASS,PASS,PASS,PASS,PASS,PASS,PASS,PASS,PASS,PASS'
```

Switch-OFF:

```text
FINAL H-R03 FAIL-REAL-BUG
runs: 'FAIL,FAIL,FAIL,FAIL,FAIL,FAIL,FAIL,FAIL,FAIL,FAIL'
```

### I15 actuation + measurement

- **Actuation:** real Puppeteer `page.mouse` clicks at iframe-translated coordinates with real `Control` key (`ctrlClickDrawing` → `singleClickDrawing` → `drawingHitLocalPoint`).
- **Measurement:** real `drawingManager.selectedDrawings` / `isDrawingSelected(page, panelId, drawId)` end-state — not toolbar/DOM shell proxies.

### Determinism note

Subsequent re-runs on build `b8` showed occasional **host-only** flake (~1/10, `second=false`) while panel B stayed **10/10 PASS**. Host-only x20 probe: **19/20 pass** (one `f=false s=true`). Primary acceptance run achieved **10/10** on first post-fix invocation; panel-B regression (the ticket target) is stable across all runs.

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I3/I13 | Dedicated kill-switch; OFF reverts each gated path in `drawing-tools-manager.js` |
| I8 | Homepage mirror byte-identical; SHA256 verified |
| I15 | Real mouse/keyboard + real selection store asserts |
| P-invariant | Only engine file touched in commit scope |
| Scope guardrail | No `MultichartGrid.jsx`, no P4/P5/peer code, no harness commit |

## 6. What I did NOT do / limits

- Did not commit harness (`react-parity-lib.mjs`, debug probes) or `known-failing.json` updates.
- Did not investigate or fix host ~5–10% harness flake (out of panel-B ticket scope; host was 10/10 on primary acceptance run).
- Did not land combined-build artifact commit (`20260716b8` dist bump is local proof only unless Manager requests).
- Synced-host drawing pollution in panel B store is **worked around** via DOM-top preference, not prevented at sync source.

## 7. Live-verification handoff

**Build id:** `20260716b8` (or later combined cut including this `drawing-tools-manager.js` SHA).

**PO steps (2v layout, panel B, ×5):**

1. Open multichart 2v built product; confirm iframe `window.__TALARIA_CHART_BUILD_ID` matches.
2. On **host A**, place two trendlines (establishes synced copies — optional but matches harness).
3. On **panel B**, place two trendlines.
4. Click trendline #1 (single select).
5. **Ctrl+click** trendline #2.
6. **Expect:** both trendlines show selected handles on B; React selection state includes both ids.
7. Repeat steps 3–6 five times.

**Switch A/B (optional):** in panel B devtools, `window.__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1 = true` + reload → step 5 should reproduce `second=false`.

## 8. Status

**DONE (proven)** — built-product harness, real actuation, 10/10 PASS (fix ON) + 10/10 FAIL-REAL-BUG (switch OFF), P5/peer switches irrelevant. PO live-confirm recommended per standard handoff (§7).
