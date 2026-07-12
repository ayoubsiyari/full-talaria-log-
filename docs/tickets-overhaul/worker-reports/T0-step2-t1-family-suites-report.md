# T0 Step 2 - T1 Family Suites Report

## Scope

Added T1 acceptance-suite harness coverage for the remaining RC-1 family rows:

- Suite C: `selection-desync`
- Suite D: `stale-quick-menu`

No engine files were edited. Changes are limited to the `multichart-prod/harness/` trees.

## New Scenarios

### H-S34 - selection-desync

**Scenario:** boot a 2-panel same-pair layout, place a trendline on host panel A, then place a rectangle on iframe panel B.

**Assertion:** after the panel-B placement, there must be exactly one selected drawing globally, owned by panel B. Panel A must have no selected drawing, no toolbar, and no axis-highlight chrome.

**Registry coverage:**

- `TAL-00157#5` - Ctrl+drag loses selection but Quick Menu stays visible/settings inaccessible.
- `TAL-00157#10` - Quick Menu remains editable while live selection is gone.
- `TAL-01405#1` - selecting/deselecting tools affects another chart.
- `TAL-01443#1` - multichart layouts cannot select/open some tools consistently.

### H-S35 - stale-quick-menu

**Scenario:** same 2-panel placement flow as H-S34.

**Assertion:** only the newest live selection may own a floating toolbar / quick menu. After panel B places the rectangle, panel A's previous toolbar must be gone and the only visible toolbar must point at panel B's selected drawing.

**Registry coverage:**

- `TAL-00157#10` - Quick Menu remains editable despite selection mismatch.
- `TAL-00322#7` - Quick Menu stacks/stays around settings surfaces.
- `TAL-01499#1` - Quick Menu behavior differs in multichart vs single-chart layouts.

## RED Evidence

Command:

```powershell
npm run test -- --only=H-S34,H-S35 --runs=3
```

Log:

```text
chart v 1.4/chart/multichart-prod/harness/red-evidence-hs34-hs35-x3.txt
```

Result:

| Scenario | Runs | Verdict |
|---|---|---|
| H-S34 | FAIL,FAIL,FAIL | FAIL-REAL-BUG |
| H-S35 | FAIL,FAIL,FAIL | FAIL-REAL-BUG |

Representative H-S34 failure:

```text
[FAIL] H-S34 CORE: exactly one selected drawing globally after cross-panel placement
  - A.selected=["<host trendline id>"] B.selected=["<panel-B rectangle id>"] expected B=<panel-B rectangle id>
[FAIL] H-S34 CORE: previous panel selection chrome cleared
  - A.toolbarVisible=true A.axisHighlightCount=22
```

Representative H-S35 failure:

```text
[FAIL] H-S35 CORE: quick menu owner matches live panel-B selection only
  - visibleToolbars=A:<host trendline id>,B:<panel-B rectangle id>
```

Both scenarios are deterministically RED on `20260712b1`.

## known-failing.json

Added H-S34/H-S35 to `expectedTests` and tracked them as known-failing:

```json
"H-S34": "T0 step 2 tracked-red: selection-desync - cross-panel placement leaves previous panel selected",
"H-S35": "T0 step 2 tracked-red: stale-quick-menu - cross-panel placement leaves previous panel toolbar visible"
```

## Gate Evidence

Command:

```powershell
npm run gate
```

Log:

```text
chart v 1.4/chart/multichart-prod/harness/gate-t0-step2-evidence.txt
```

Gate summary:

```text
Known failing baseline: H-S34, H-S35
Known-failing still red: H-S34, H-S35
Regressions (not in baseline but failed): (none)
GATE H-S34 FAIL (known-failing)
GATE H-S35 FAIL (known-failing)
[gate] PASS: no new regressions; 2 known-failing tracked.
```

This confirms the existing 31 scenarios remain gate-green and the two new failures are tracked RED only.

## Consistency / Checks

Syntax:

```powershell
node --check scenarios.mjs
node --check interactive-helpers.mjs
node --check gate.mjs
```

All passed.

Cursor lints:

```text
No linter errors found.
```

SHA256 mirror checks:

| File | Status | SHA256 |
|---|---|---|
| `scenarios.mjs` | MATCH | `3f47c20ffbeee369d8713962373145d72b649b783c339d3cea44d0a696fc4453` |
| `known-failing.json` | MATCH | `b3172ac7d535dfcb8425bfdfaf5e35300e388401310a2a8f71bc836bced07a3d` |
| `interactive-helpers.mjs` | MATCH | `f8024755e60ad8ada21a49e69d7a51d487da463794777c3789a8875083fb6d3b` |

## Invariant Statements

- I9 intact: existing H-S2 through H-S33 assertions were not changed.
- No engine files edited.
- Legacy `multichart/` tree untouched.
- Both production harness trees are byte-identical for edited harness files.
- No dependency or security-rule changes.
