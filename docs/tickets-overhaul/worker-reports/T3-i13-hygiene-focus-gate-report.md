# T3 — I13 hygiene: focus useEffect P5 gate

## 1. Task + RC

- **Task:** `T3-i13-hygiene-focus-useeffect-gate-lane2` — close I13 one-knob-revert gap in focus-change peer-adjacent churn (ESC-019 hygiene debt).
- **RC:** Tooling/hygiene — not an HR-PARITY row fix. Does not address H-R03 (Lane 1 owns that).

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Wrapped `useEffect([focusedPanelId])` peer side-effect (`clearDrawingUiOnOtherPanels` / `deselectDrawingsOnNonFocusedPanels` fallback) behind `multichartPeerDeselectV1Enabled()`. `dispatchFocusChanged` still runs unconditionally (topbar mirror, not P5). |
| `chart v 1.4/chart/multichart-prod/multichart-manager.js` | Added entry guard `if (!multichartPeerDeselectV1Enabled()) return Promise.resolve()` on `deselectDrawingsOnNonFocusedPanels` and `clearDrawingUiOnOtherPanels` (legacy-shell I13 belt-and-suspenders). |
| `homepage/public/chart/multichart-prod/multichart-manager.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/dist-v9/**` | `npm run build:live` rebundle for harness proof (`20260716b9`). |

**Not touched:** `drawing-tools-manager.js`, harness, `known-failing.json`.

### Lines gated (MultichartGrid)

```4051:4061:chart v 1.4/talaria-design/src/MultichartGrid.jsx
            lastFocusMirrorKeyRef.current = "";
            dispatchFocusChanged(focusedPanelId, { force: true });
            if (multichartPeerDeselectV1Enabled()) {
                const grid = window.__multichartGrid;
                if (grid && typeof grid.clearDrawingUiOnOtherPanels === "function") {
                    grid.clearDrawingUiOnOtherPanels(focusedPanelId);
                } else if (grid && typeof grid.deselectDrawingsOnNonFocusedPanels === "function") {
                    grid.deselectDrawingsOnNonFocusedPanels(focusedPanelId);
                }
            }
```

## 3. Kill-switch (I13)

| Switch | Default | Effect after this change |
|--------|---------|--------------------------|
| `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` | unset = ON | When `true`, `multichartPeerDeselectV1Enabled()` false → focus `useEffect` **skips** peer UI clear; manager prototype methods no-op. |
| `__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` | unset = ON | Child switch under P5 master (unchanged). |

**Switch-OFF revert:** focus panel changes no longer trigger settings-close / peer-deselect churn from this `useEffect` leg (previously settings-close ran even when P5 master OFF).

## 4. Proof

### Switch-ON unchanged (H-R06 / H-R07 spot check, build `20260716b9`)

```bash
node react-run.mjs --only=H-R07,H-R06 --runs=3
```

| Scenario | Result |
|----------|--------|
| H-R06 | **3/3 PASS** |
| H-R07 | **3/3 PASS** |

No regression on peer-isolation or Delete rows with switches ON.

### Switch-OFF behavior (design intent)

With `--phase5-off`, focus `useEffect` no longer calls `clearDrawingUiOnOtherPanels(focusedPanelId)` — focus-change peer-adjacent settings/deselect churn from this path is fully reverted. Other gated paths (`onPanelFocus`, message handlers) were already behind `multichartPeerDeselectV1Enabled()`.

## 5. Invariants

| Inv | Status |
|-----|--------|
| I8 | `multichart-manager.js` mirrors SHA256-identical |
| I13 | P5 master now gates focus `useEffect` peer leg + manager prototype entry |
| Scope | Disjoint from Lane 1 H-R03 `drawing-tools-manager.js` region |

## 6. What I did NOT do

- Did not fix H-R03 panel-B ctrl-select (Lane 1).
- Did not gate `dispatchFocusChanged` (not peer-isolation).
- Did not gate `multichart-drawing-selected` guard arm (separate I13 item; out of scope).

## 7. Live-verification handoff

On build with P5 master OFF: change focus A→B→C rapidly — peer panels should **not** auto-close settings / deselect from focus `useEffect` alone (other user actions may still clear). With master ON, behavior unchanged from pre-hygiene.

## 8. Status

**DONE (dev only) — NEEDS-LIVE** — harness spot-check only; PO confirms focus-change settings behavior on combined build.

### SHA256

| File | SHA256 |
|------|--------|
| `MultichartGrid.jsx` | `b7363dab64b28901361b1e12d6adc8e3a431707930cdd89b07182e470cd119d1` |
| `multichart-manager.js` (both trees) | `e286f098aa8a18d757f96b61201175fc271f4c9d1722ef303a6cd9ce94f8c682` |

**Commit:** file-scoped (source + manager mirrors + dist bundle for Grid).
