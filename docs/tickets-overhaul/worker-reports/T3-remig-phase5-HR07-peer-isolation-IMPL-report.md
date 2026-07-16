# T3 Phase 5 — H-R07 peer isolation IMPLEMENT (D-021)

## 1. Task + RC

- **Task:** `T3-remig-phase5-lane2-HR07-peer-isolation-IMPL-D021` — design + implement Phase 5 cross-panel selection peer isolation; correct D-021 (H-R07 is HONEST-RED, not dropped).
- **RC:** HR-PARITY cross-panel select — selecting in panel B must leave exactly one global selection (`!hostSel && panelSel`) without stale async `deselectDrawings` wiping B’s fresh store commit.

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Added P5 master `_isMcRemigrationPhase5PeerIsolationSliceActive()`; gated `multichartPeerDeselectV1Enabled()` through it; debounced peer `deselectDrawings` via `schedulePeerDeselectPanel` + `cancelScheduledPeerDeselect` so in-flight iframe commands cannot race a fresh `multichart-drawing-selected`; cancel pending deselect on source panel in `multichart-clear-drawing-ui` / `multichart-drawing-selected` handlers. |
| `chart v 1.4/chart/multichart-prod/multichart-manager.js` | Mirror P5 master gate on `multichartPeerDeselectV1Enabled()` (I8). |
| `homepage/public/chart/multichart-prod/multichart-manager.js` | Byte-identical mirror (SHA256 `b28e82415d21fcfa669d702b39daf4937422d2dc73ed4a72875e528f798b8eb7`). |
| `chart v 1.4/chart/dist-v9/**` + `homepage/public/chart/dist-v9/**` | `npm run build:live` rebundles MultichartGrid into `talaria-v9-live.js`. |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | `--phase5-off` / `REACT_PARITY_PHASE5_OFF` seeds `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION`. |
| `chart v 1.4/chart/multichart-prod/harness/react-run.mjs` | CLI `--phase5-off` + ctx pass-through. |
| `chart v 1.4/chart/multichart-prod/harness/t3-step5-switch-off-proof.mjs` | Switch-OFF proof uses P5 master (not child switch). |
| `chart v 1.4/chart/multichart-prod/harness/HARNESS-REFERENCE.md` | Document P5 master hook row. |
| `serve.mjs` / `chart-embed.html` (both trees) | Build id bumped to **`20260716b5`** via `bump-dist-v9-cache.mjs`. |

**No other product files intentionally edited** (no `panel-cmd-bridge.js`, no `drawing-tools-manager.js`, no `replay-system.js`, no `known-failing.json` — Lane 4).

**MultichartGrid.jsx disjoint from Lane 1 H-R06 Delete:** peer-isolation hunks are `~88–105` (switch), `~1848–1850` (timer ref), `~5155–5225` (debounced deselect), `~6467/6519` (message cancel). H-R06 Delete lives in keyboard/`runCommandOnAllPanels`/`panel-cmd-bridge` bands — no overlapping edit ranges.

### Region map (peer-isolation path)

```
iframe selectDrawing
  → notifyV9SelectionSync → postMessage multichart-drawing-selected (sync)
  → _requestMultichartClearDrawingUiOnOtherPanels → multichart-clear-drawing-ui
parent MultichartGrid
  → multichart-drawing-selected: arm __v9DrawingSelectionGuardUntil 400ms; cancelScheduledPeerDeselect(source); focusPanelById; deselectDrawingsOnNonFocusedPanels(source)
  → deselectDrawingsOnNonFocusedPanels: schedulePeerDeselectPanel (32ms, re-check guard) for host + iframe peers except source
  → clearDrawingUiOnOtherPanels: peer deselect + settings close (P3 flash guard ~5183–5224 untouched)
```

**Root cause fixed:** immediate `sendCommandNoReply('deselectDrawings')` from an earlier “A owns selection” clear could arrive at panel B after B’s select commit. Debounce + cancel-on-select + selection-guard skip prevents stale peer wipe.

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gates |
|--------|---------|-------|
| `window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION` | **unset = ON** | P5 master — `MultichartGrid.jsx`, `multichart-manager.js` (both trees). When true, `multichartPeerDeselectV1Enabled()` returns false → all peer-clear paths no-op. |
| `window.__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1` | unset = ON | Child switch under P5 master (unchanged semantics). |

Harness A/B: `--phase5-off` / `REACT_PARITY_PHASE5_OFF=1`.

Switch OFF reverts to dual-selection leak (`A.selected=true B.selected=true`) — real bug surface.

## 4. Proof — RED → GREEN

### H-R07 (built-product React harness, build `20260716b5`)

**Actuation (I15):** real mouse place/select on host A + iframe B; real `focusReactPanel(B)` + `singleClickDrawing` at hit-coords.

**Measurement:** `isDrawingSelected` per panel store + parent V9 bar cleared on A (`readReactParityState`).

| Command | Result |
|---------|--------|
| `node react-run.mjs --only=H-R07 --runs=10` | **10/10 PASS** — `A.selected=false B.selected=true` every run |
| `node react-run.mjs --only=H-R07 --runs=10 --phase5-off` | **9/10 FAIL** (dual selection `A.selected=true B.selected=true`); 1/10 flake PASS — **FAIL-REAL-BUG** demonstrated |
| `node t3-step5-switch-off-proof.mjs` | CORE FAIL as expected (`A.selected=true B.selected=true`) |

**RED before (from Phase 0 revalidation):** 6/10 PASS / 4/10 FAIL — `B.selected=false` flake.

**Evidence files:** `chart v 1.4/chart/multichart-prod/harness/d021-gate-react.txt`

### `npm run gate:react`

| Test | Verdict | Notes |
|------|---------|-------|
| H-R07 | **PASS** (newly fixed — remove from `known-failing.json`, Lane 4) | |
| H-R06 | PASS | unrelated Lane 1 |
| H-R03 | FAIL (panel B ctrl-select) | Pre-existing in tree (`d021-gate-react-clean.txt` also shows H-R03 regression); host passes |
| H-R04 | FAIL-FLAKE (panel B dbl-click settings) | 1/3 pass on re-run |
| H-R05 | PASS | |
| All others | PASS | |

Gate exits non-zero due to **H-R03** regression (not in known-failing baseline). **Not introduced by P5 hunks** — panel-B-only; P5 does not touch ctrl-select or settings-open paths.

### H-S34 / H-S35 / H-S44 (host harness, P5 promotion duties)

`node run.mjs --only=H-S34,H-S35,H-S44`:

| ID | Verdict | Disposition |
|----|---------|-------------|
| H-S34 | **PASS** | Cross-panel placement peer isolation OK — promote when Manager updates baseline |
| H-S35 | FAIL-REAL-BUG | `visibleToolbars=(none)` — V9 quick-bar visibility on legacy harness; **not P5 store isolation** — defer to Lane 2 chrome routing |
| H-S44 | FAIL-REAL-BUG | Store select OK; `toolbarVisible=false` — same chrome proxy gap — defer |

Lane 4: keep H-S35/H-S44 in `known-failing.json` until chrome routing lands; H-S34 candidate for promotion.

## 5. Invariants checked

| Inv | Status |
|-----|--------|
| I8 | `multichart-manager.js` mirrored SHA256-identical |
| I13 | P5 master gates React + manager; harness `--phase5-off` wired |
| I14 | No parent globals in iframe; postMessage-only peer path preserved |
| I15 | H-R07 uses real mouse actuation + store selection asserts |
| Guardrails | No Phase-1 engine files, no `known-failing.json`, no `replay-system.js`, no `panel-cmd-bridge.js` |

## 6. What I did NOT do / limits

- Did **not** edit `known-failing.json` (Lane 4 removes H-R07).
- Did **not** fix H-R03 panel-B ctrl-select or H-S35/H-S44 toolbar visibility (out of P5 scope).
- Switch-OFF A/B is **9/10** FAIL (one flake PASS when host happens to deselect via non-P5 path) — acceptable for REAL-BUG proof.
- `gate:react` not fully clean — H-R03 blocks; coordinate with hitcoord/Lane 4 baseline.
- No PO live-confirm on deployed server — harness-only evidence.

## 7. Live-verification handoff

1. Deploy build **`20260716b5`** (`build:live` + server rebuild).
2. Open multichart 2v backtest layout.
3. Place trendline on **A**, click to select.
4. Click **B** panel, place rectangle, click to select.
5. **Expect:** only B shape selected (blue handles on B); A deselected; V9 quick bar tracks B.
6. DevTools: `window.__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION = true` + reload → both A and B can remain selected (bug returns).

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

H-R07 proven **10/10** on frozen built-product harness (`dist-v9`, build `20260716b5` inside panel-B iframe). PO live-confirm still required per D-010/I15 for “proven” label on parent↔iframe fixes.

### SHA256

| File | SHA256 |
|------|--------|
| `MultichartGrid.jsx` | `cf41c375180e3d12fbcb35c57e4db6c11ace9640549eb2bfb72a2ec757c40275` |
| `multichart-manager.js` (both trees) | `b28e82415d21fcfa669d702b39daf4937422d2dc73ed4a72875e528f798b8eb7` |

**Commit:** file-scoped staging ready — awaiting Manager-coordinated commit (not pushed).
