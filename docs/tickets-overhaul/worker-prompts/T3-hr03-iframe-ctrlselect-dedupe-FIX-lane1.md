# T3 — H-R03 iframe ctrl-select double-actuation FIX (Lane 1)

Per the Lane 2 diagnostic (`T3-hr03-regression-diagnostic-report.md`): H-R03 panel-B ctrl multi-select fails because ctrl+click double-fires `selectDrawing(d2, addToSelection=true)` in the iframe (canvas-capture `mousedown` ~2413–2439 + shape `click` ~7638–7641), and the 80ms `_suppressNextIframeCtrlSelectToggle` window misses → the second call hits the toggle-off branch (~9931) and removes drawing #2. Host passes (not an iframe embed). **This is an engine gesture-dedupe bug, NOT peer-isolation (P5 ruled out).**

## Fix (option 1 recommended)
In `drawing-tools-manager.js` `selectDrawing` addToSelection path: when `index > -1` (would toggle #2 OFF), if `isMultichartIframeEmbed()` AND `_suppressNextIframeCtrlSelectToggle` is fresh for the same id → **return without toggling** (mirror the early-return at ~9903–9905). Extend the suppress `until` window from 80ms to **~200–250ms** to match `__v9DrawingSelectionGuardUntil` (~9892). Do NOT change host behavior (host is already 10/10).

## Kill-switch (I3/I13 — mandatory)
New own switch, e.g. `window.__TALARIA_DISABLE_IFRAME_CTRL_SELECT_DEDUPE_V1` (unset = fix ON). OFF must fully revert to today's (broken) toggle behavior so the A/B RED is honest. Cover both trees (I8). Do NOT extend P4/P5 switches (unrelated root).

## Proof (I15, D-011) — on the combined build
- `node react-run.mjs --only=H-R03 --runs=10` → **10/10 PASS** (panel B `first=true second=true`, host stays 10/10).
- Switch-OFF A/B (coordinate the hook with Lane 4, who owns `react-parity-lib.mjs`) → **10/10 FAIL-REAL-BUG**.
- Confirm `--phase5-off` / `--peer-deselect-off` remain **irrelevant** to H-R03 (proves the fix is in the right place, not peer-isolation).
- Bump to a fresh combined build id (coordinate with Lane 4 — do NOT reuse b6).

## Guardrails
- `drawing-tools-manager.js` only (both trees, I8, SHA256 in report). No `MultichartGrid.jsx`, no peer/P5 code, no harness/known-failing (Lane 4). File-scoped commit.

## Report — WORKER-REPORT-STANDARD.md
`docs/tickets-overhaul/worker-reports/T3-hr03-iframe-ctrlselect-dedupe-FIX-report.md` — exact lines changed, new switch, H-R03 RED→GREEN 10/10 + switch-OFF A/B, confirmation P5/peer switches irrelevant, commit hash + SHA256, new build id, NEEDS-LIVE PO step (2v panel B: place 2 trendlines → select #1 → ctrl+click #2 → both selected, ×5).
