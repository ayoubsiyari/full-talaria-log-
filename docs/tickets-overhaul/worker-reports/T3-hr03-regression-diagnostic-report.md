# T3 — H-R03 panel-B ctrl-select regression diagnostic

## 1. Task + RC

- **Task:** `T3-hr03-panelb-ctrlselect-regression-DIAGNOSTIC-lane2` — read-only trace of combined build `20260716b6` H-R03 panel-B failure.
- **RC:** HR-PARITY row 3 — Ctrl+click additive multi-select on iframe panel B (`first=true second=false`); blocks ESC-019 unfreeze.

## 2. Symptom precision (I15)

| Surface | Actuation | End-state | b6 result |
|---------|-----------|-----------|-----------|
| Host A | `singleClickDrawing` → `ctrlClickDrawing` (real mouse + Control) | `dm.selectedDrawings` contains both ids | **10/10 PASS** |
| Panel B | same | both ids in iframe store | **10/10 FAIL** — `first=true second=false` |

Evidence: `chart v 1.4/chart/multichart-prod/harness/combined-b6-hr03-isolated-x10.txt` (default switches ON).

**Not** a full-store wipe (`first=false second=false`). Drawing #1 stays selected; drawing #2 never sticks. Matches **additive select then toggle-off** or **add never commits** — toggle-off is the closer fit (see §4).

## 3. Switch-OFF matrix (Lane 4 evidence)

All **10/10 panel-B FAIL** — host stays 10/10 PASS:

| Harness flag | Switch | Evidence file |
|--------------|--------|---------------|
| (default) | all ON | `combined-b6-hr03-isolated-x10.txt` |
| `--phase5-off` | `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` | `combined-b6-hr03-phase5off-x10.txt` |
| `--peer-deselect-off` | `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` | `combined-b6-hr03-peeroff-x10.txt` |
| `--panel-keyboard-off` | `__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` | `combined-b6-hr03-kboff-x10.txt` |

**Conclusion:** Active failure path is **not** gated by P1/P4/P5 peer/keyboard switches. Regression rides an **iframe-only interaction path** (or a parent path that runs with all those switches OFF).

## 4. End-to-end ctrl-select trace (panel B)

### Harness sequence (`react-parity-scenarios.mjs` `hR03`)

```
placeTool(B, trendline ×2)
→ focusReactPanel(B)          // focusPanelById + canvas click
→ disarmDrawTool(B)
→ singleClickDrawing(B, d1) // notifyV9SelectionSync → parent multichart-drawing-selected
→ waitForReactSelection [d1]
→ ctrlClickDrawing(B, d2)     // focusReactPanelSoft + Control + singleClickDrawing
→ waitForReactSelection [d1,d2]  // often times out; assert first=true second=false
```

### Iframe engine (drawing #2 ctrl+click)

Two actuation surfaces fire on the same physical click:

| Step | Surface | File:lines | Behavior |
|------|---------|------------|----------|
| 1 | Canvas capture `mousedown` | `drawing-tools-manager.js:2413–2439` | `_isCtrlPointerModifier` → `findDrawingsAtPoint` → `selectDrawing(ctrlBest, true)` (add) |
| 1b | (iframe only) | `drawing-tools-manager.js:2433–2437` | Arm `_suppressNextIframeCtrlSelectToggle` { id, until: now+**80ms** } |
| 2 | Shape `click` handler | `drawing-tools-manager.js:7638–7641` | `selectDrawing(drawing, _isMultiSelectModifier(event))` |

**Suppress gate** (`drawing-tools-manager.js:9897–9909`): second `selectDrawing(..., true)` returns early only if same id, fresh ≤80ms, **already in `selectedDrawings`**.

**Toggle-off path** (`drawing-tools-manager.js:9931–9936`): if second call is `addToSelection` and drawing **already selected**, it **removes** the drawing instead of adding.

### Failure mechanism (primary root cause)

**Iframe double-actuation toggle:**

1. Canvas capture `mousedown` adds d2 to `selectedDrawings`.
2. Shape `click` (same puppeteer `mouse.click`, ~25ms later) calls `selectDrawing(d2, true)` again.
3. If suppress misses (timing >80ms, id mismatch, or d2 not yet visible in `selectedDrawings` when suppress runs), the second call hits the **toggle-off** branch → d2 removed.
4. Store ends `first=true second=false`.

**Why host passes:** Host is not `isMultichartIframeEmbed()` — suppress/arming differs; canvas capture + shape click ordering / pointer-events stack on in-process host does not produce the same double-toggle (10/10 PASS on same build).

**Why regression vs `20260715b2`:** H-R06/H-R07 bundle `f46e6d9d` landed in the same `MultichartGrid.jsx` commit as P5 debounce; combined cut `b6` rebundles dist-v9. Panel-B-only failure points at **iframe embed interaction** (pre-existing double-path + tight 80ms suppress), not at a newly introduced host path. Increased parent churn from P5-adjacent handlers may tighten timing but **switch-OFF proves peer deselect is not the active wiper**.

### Parent shell (MultichartGrid) — secondary paths considered

| Path | Switch-gated? | Can wipe B store on ctrl #2? |
|------|---------------|------------------------------|
| `onPanelFocus` → `deselectDrawingsOnNonFocusedPanels` (prev===id) | Yes (`multichartPeerDeselectV1Enabled` at 2232) | No when switches OFF; when ON, schedules **host/other** deselect only, not focus panel |
| `multichart-drawing-selected` → peer deselect | Yes (6521–6524) | Only on **first** single-click (d1); ctrl add uses `suppressToolbar=true` → **no** second postMessage |
| `schedulePeerDeselectPanel(B)` | Yes (5178, 5184) | Never schedules focus panel B |
| `useEffect` focus side-effects (4055–4058) | **Partial I13 gap** (see §5) | `clearDrawingUiOnOtherPanels` inner deselect gated; does not run on same-panel ctrl if focus unchanged |

**P4 (keyboard):** `multichartPanelKeyboardV1Enabled` gates Delete/Esc only (`MultichartGrid.jsx:4350, 5963`; `panel-cmd-bridge.js`). No ctrl+click involvement — **ruled out**.

**`multichart-manager.js` (`52894a8d`):** P5 master added to `multichartPeerDeselectV1Enabled()`; message handlers already gated. React harness uses `MultichartGrid` postMessage listener, not manager fan-out — **not the active failure surface**.

## 5. I13 gap analysis — prime suspect disproved, gaps named

### Prime suspect: P5 debounce runs regardless of switch

**DISPROVED** for this regression.

`schedulePeerDeselectPanel` returns immediately when `multichartPeerDeselectV1Enabled()` is false:

```5177:5184:chart v 1.4/talaria-design/src/MultichartGrid.jsx
function schedulePeerDeselectPanel(panelId) {
    if (!multichartPeerDeselectV1Enabled()) return;
    ...
    timers[key] = setTimeout(() => {
        if (!multichartPeerDeselectV1Enabled()) return;
```

`multichartPeerDeselectV1Enabled()` requires **both** P5 master and child peer switch unset (`MultichartGrid.jsx:99–104`). Lane 4 switch-OFF runs prove **no deselect timer fires** — yet H-R03 panel-B still fails.

The regression is **not** “debounce running regardless of switch.” It is **iframe ctrl double-actuation** (ungated by design — engine interaction, not P5).

### Real I13 gaps (should close on fix, but do not explain switch-OFF failure)

| Location | Ungated behavior | Effect on H-R03 |
|----------|------------------|-----------------|
| `MultichartGrid.jsx:4055–4058` | `useEffect([focusedPanelId])` calls `clearDrawingUiOnOtherPanels(focusedPanelId)` **without** P5 master check | Inner peer deselect gated; settings-close still runs. Not store wipe on same-panel ctrl. |
| `MultichartGrid.jsx:6513–6520` | `multichart-drawing-selected`: arms `__v9DrawingSelectionGuardUntil` + `cancelScheduledPeerDeselect` + `focusPanelById` without P5 check | Runs on d1 single-click only; does not explain d2 wipe with switches OFF. |
| `MultichartGrid.jsx:5217` | `cancelScheduledPeerDeselect(focus)` inside `deselectDrawingsOnNonFocusedPanels` before schedule | Harmless (clearTimeout only). |
| `multichart-manager.js:855–868` | `clearDrawingUiOnOtherPanels` sends `deselectDrawings` with **no internal switch gate** | Call sites gated; React path uses Grid handler. Legacy-shell I13 debt. |

## 6. Root cause (single sentence)

**Panel-B ctrl+click double-fires `selectDrawing(d2, true)` (canvas capture mousedown + shape click); the iframe-only 80ms `_suppressNextIframeCtrlSelectToggle` window fails to dedupe, so the second call toggles drawing #2 off — `first=true second=false`.**

## 7. Proposed fix (do not implement until Manager confirms)

### Owning lane: **Lane 1** (engine interaction — `drawing-tools-manager.js`)

Peer isolation (Lane 2 / P5) is **not** the owning fix — switches prove it. Lane 1 owns iframe ctrl multi-select transport.

**Minimal fix options (pick one):**

1. **Extend suppress + apply on toggle branch** (recommended): In `selectDrawing` addToSelection path, when `index > -1` (would toggle off), if `isMultichartIframeEmbed()` and `_suppressNextIframeCtrlSelectToggle` is fresh for same id → **return without toggling** (mirror early-return at 9903–9905). Extend `until` to **200–250ms** to match `__v9DrawingSelectionGuardUntil` (line 9892).

2. **Block shape click after canvas ctrl commit:** Set `_iframeCtrlSelectHandledUntil` on canvas path; shape `handleClick` / d3 handlers check and skip `selectDrawing` when flag fresh.

3. **Do not arm toggle on duplicate same-gesture:** If `performance.now() - lastCtrlSelectAt < N` and same drawing id, skip second call entirely.

**Switch-OFF revert (I13):** Fix is in engine gesture dedupe — unrelated to P5. After fix, `--phase5-off` / `--peer-deselect-off` should remain **irrelevant** to H-R03 (correct: switches never caused this bug).

**Lane 2 follow-up (I13 hygiene, optional same PR if Manager wants):** Gate `useEffect` focus side-effect (`4055–4058`) behind `multichartPeerDeselectV1Enabled()` so P5 master OFF reverts **all** focus-change peer-adjacent churn.

## 8. Proposed RED (deterministic)

Already reproduces 10/10 on `20260716b6`:

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
node react-run.mjs --only=H-R03 --runs=10
```

**Pass bar after fix:** 10/10 PASS; panel-B CORE `first=true second=true` every run.

**Discriminating A/B (post-fix):**

- Default ON: 10/10 PASS (proves fix).
- `--phase5-off` ×10: should **remain PASS** (proves regression was not peer-isolation; switch irrelevant).

Optional isolated probe:

```bash
node react-run.mjs --only=H-R03 --runs=10 --peer-deselect-off
```

## 9. P4 / P5 / manager ruled-in summary

| Contributor | Verdict |
|-------------|---------|
| P5 `schedulePeerDeselectPanel` | **Ruled out** as active wiper (switch-OFF 10/10 FAIL persists) |
| P4 `PANEL_KEYBOARD_V1` | **Ruled out** (`--panel-keyboard-off` 10/10 FAIL) |
| `multichart-manager.js` P5 gate (`52894a8d`) | **Ruled out** (React Grid owns message path; gated) |
| Iframe ctrl double-actuation | **Ruled in** (symptom + host/B split + switch matrix) |

## 10. Invariants / guardrails

- Read-only diagnostic — **no product/harness/registry edits**.
- Both trees read scope: `MultichartGrid.jsx`, `multichart-manager.js`, `drawing-tools-manager.js`.

## 11. Live-verification handoff

After Lane 1 fix on combined build: 2v layout → panel B → place two trendlines → select first → Ctrl+click second → both show resize handles; repeat 5×.

## 12. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)** — awaiting Manager scope confirmation for Lane 1 implement.
