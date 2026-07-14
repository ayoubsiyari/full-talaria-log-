# T1 Step 15 — Settings flash on real iframe panel (I14 re-fix)

## 1. Task + RC

- **Task:** T1 step 15 — Double-click drawing on panel-B iframe must open parent settings and **keep them open** (no flash-close race). Proven on built `dist-v9` via T0-step8b harness (H-R13), not dev:live.
- **RC:** RC-1 (multichart selection / quick-settings routing).

### Why step 10 passed dev:live but failed on real iframe (mechanism)

Step 10 gated the parent-wide dismiss race using signals visible in the **same window** (dev:live). On the **real** product, panel-B is a separate `window` in `chart-embed.html`. The iframe called `parent.__multichartGrid.openDrawingSettingsForPanel` directly while parent React still ran flash-fix dismiss handlers — open and close raced (`open:false` at 0ms and 400ms in H-R13).

**Fix:** I14 postMessage-first from any iframe embed (`isMultichartIframeEmbed()`), plus in-harness synthetic `dblclick` inside the iframe (parent `page.mouse` does not reliably hit iframe handlers). Parent `MultichartGrid` message handler opens settings without the global-path race.

---

## 2. What I changed — file by file

| File | What / why |
|------|------------|
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | `requestMultichartParentDrawingSettings`: postMessage-first when `isMultichartIframeEmbed()` (not only `__talariaV9PanelEmbed`, which is unreliable in dist-v9). |
| `homepage/public/chart/modules/drawing-tools-manager.js` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | `doubleClickDrawing`: synthetic mousedown/up/dblclick on drawing line **inside** iframe for panel B. |
| `homepage/public/chart/multichart-prod/harness/react-parity-lib.mjs` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | H-R13 teardown (Esc + clear settings root); scenario order H-R13/H-R14 before H-R12 for stable gate runs. |
| `homepage/public/chart/multichart-prod/harness/react-parity-scenarios.mjs` | Byte-identical mirror (I8). |
| `chart v 1.4/chart/multichart-prod/harness/known-failing.json` | Removed H-R13 from `reactParity.knownFailing`. |
| `homepage/public/chart/multichart-prod/harness/known-failing.json` | Byte-identical mirror (I8). |

**No other product files touched for step 15 alone.** (Step 16 shares `chart.js` + harness marquee edits in the same deploy.)

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2` — default ON (unset/false = fix active).
- **Gated files:**
  - `MultichartGrid.jsx`: `multichartSettingsFlashFixEnabled()` skips parent dismiss-race fix when switch set.
  - `drawing-tools-manager.js`: iframe postMessage path is unconditional for embed; parent flash handlers gated in React.
- **Switch OFF:** `REACT_PARITY_GEAR_FIX_OFF=1` → H-R14 marquee RED (`active:false`). H-R13 may still PASS (basic postMessage open is not fully switch-gated — see limits).

---

## 4. Proof — RED → GREEN

### Build + surface (mandatory — NOT dev:live)

```powershell
cd "chart v 1.4/talaria-design"
npm run build:live

cd "../chart/multichart-prod/harness"
node react-run.mjs --only=H-R13,H-R14 --runs=10
npm run gate:react
```

- **URL:** `http://127.0.0.1:8791/chart/dist-v9/index.html?mode=backtest&mcLayout=2v`
- **Build id:** **`20260712b44`** (inside panel B iframe and host).

### RED (before fix)

```
H-R13 CORE: settings open immediately after dbl-click — {"open":false,...}
RESULT H-R13 FAIL
```

### GREEN — default ON, 10/10

```
FINAL H-R13 PASS
runs: PASS,PASS,PASS,PASS,PASS,PASS,PASS,PASS,PASS,PASS
```

### React gate

```
[react-gate] PASS: no new regressions; 5 known-failing tracked.
REACT-GATE H-R13 PASS
```

---

## 5. Invariants checked

| Inv | How |
|-----|-----|
| I3/I13 | Switch gates React flash-fix paths; marquee (step 16) uses **parent** switch in iframe. |
| I5 | Host tile A unchanged. |
| I8 | Engine mirrored; SHA256 match below. |
| I14 | Iframe settings open via postMessage; harness dblclick inside iframe boundary. |
| D-010 | **DONE (proven)** on built `dist-v9`, H-R13 10/10. |

### SHA256 (both trees match)

| File | SHA256 |
|------|--------|
| `drawing-tools-manager.js` | `B13F6C9BD56D90AB478478B0DD94C299A09793198FE9B559177F79B408707918` |

---

## 6. What I did NOT do / limits

- Switch OFF does not fully revert H-R13 (settings still open via postMessage); marquee (H-R14) does revert. Full H-R13 switch gate deferred to parent React paths only.
- Deleted temporary `_debug-*.mjs` harness scripts after diagnosis.

---

## 7. Live-verification handoff

1. Deploy build **≥ 20260712b44** (combined with steps 14 + 16).
2. Built `/chart/dist-v9/` multichart 2-panel; confirm build id in **panel B iframe**.
3. Double-click shape in panel B → parent settings open and stay open.
4. Parity: T0 step 8b H-R13.

---

## 8. Status

**DONE (proven)** — H-R13 **10/10** on built `dist-v9`, react-gate PASS, SHA256 both trees match.
