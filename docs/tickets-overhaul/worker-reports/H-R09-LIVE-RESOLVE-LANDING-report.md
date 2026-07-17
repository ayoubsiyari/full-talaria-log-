# H-R09 live-resolve hardening — LANDING report (D-027 contingency)

**Trigger:** §0 met — D-024 barrier shipped; H-R09/H-R04 still **9/10** and **8/10** isolated with `storeOk=true; v9BarVisible=false` lag signature. A6-4 order path ruled out (master-OFF 10/10).  
**Authority:** [`H-R09-LIVE-RESOLVE-HARDENING-SPEC.md`](../H-R09-LIVE-RESOLVE-HARDENING-SPEC.md)  
**Build stamped for Lane 4:** **`20260717b42`** (parent + panel B iframe match)  
**Status:** **DONE (dev only) — NEEDS-LIVE** · hand to Lane 4 for `gate:react` + bless

---

## 1. I16 — state matrix (customer data)

**None.** This change touches only parent V9 quick-bar React state and multichart selection guard timing. No localStorage, session files, order/trade records, or schema migrations.

---

## 2. Kill-switch (I3 + I13)

| Property | Value |
|----------|--------|
| **Switch** | `window.__TALARIA_DISABLE_V9_QUICKBAR_LIVE_RESOLVE_V1` |
| **Default** | unset → fix **ON** |
| **Harness** | `--v9-quickbar-live-resolve-off` · `REACT_PARITY_V9_QUICKBAR_LIVE_RESOLVE_OFF=1` |

**Independent of:** D-024 V4 · D-026 transport V1/A · chrome routing V3 · A6-4 order store.

---

## 3. Files changed

| File | Hunks |
|------|--------|
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | A–E + postMessage backup + pointerup store poll + extended rAF hydrate |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | F — selection guard **600ms** when fix ON (400ms when OFF) |
| `chart v 1.4/chart/dist-v9/` (+ homepage mirror via `build:live`) | Rebuilt bundle |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | `readParentQuickBarLagSignature`, boot hook |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | **H-R09-LR** scenario |
| `chart v 1.4/chart/multichart-prod/harness/react-run.mjs` | `--v9-quickbar-live-resolve-off` |

---

## 4. Mechanism (summary)

When iframe panel B commits selection before `grid.getChartForPanel(B).drawingManager` resolves on the parent beat, `onV9Sel` used to hit `if (!live) return` and never arm `#v9-tl-bar`. Fix ON:

1. **`v9ArmQuickBarFromPostMessageDetail`** — anchor by `panelId` + `drawingId`, arm `tlBarSelected`, force-resolve drawing on panel DM, rAF + delayed retries.
2. **Backup paths** — raw `multichart-drawing-selected` message listener + pointerup poll of focused iframe store.
3. **`v9ResolveLiveDrawingFromQuickBarAnchor`** — panel-first lookup; trust anchor during selection guard.
4. **Hunk E** — clear stale `__talariaV9QuickBarDomReady` when `tlBarSelected && !tlBarShowQuickBar` (anti false-GREEN).
5. **Hunk F** — extend iframe selection guard 400→600ms when fix ON.

---

## 5. Proof — `20260717b42`, `REACT_PARITY_ISOLATE_SESSION=1`

| Command | Result | Log |
|---------|--------|-----|
| `node react-run.mjs --only=H-R09-LR --runs=10` | **9/10 PASS** (1 lag miss) | `hr09-lr-on-x10-b42.txt`, `hr09-lr-on-x10-b42-final.txt` |
| `node react-run.mjs --only=H-R09 --runs=10` | **10/10 PASS** | `hr09-on-x10-b42.txt` |
| `node react-run.mjs --only=H-R04 --runs=10` | **10/10 PASS** | `hr04-on-x10-b42.txt` |
| `node react-run.mjs --only=H-R05 --runs=10` | **8/10 PASS** (2× dom-ready timeout panel B) | `hr05-on-x10-b42.txt` |
| `node react-run.mjs --only=H-R09-LR --runs=10 --v9-quickbar-live-resolve-off` | **10/10 PASS** | `hr09-lr-off-x10-b42.txt` |

### Discriminator note (Lane 4)

**`--v9-quickbar-live-resolve-off` alone is vacuous** when D-024 dom-ready wait is ON (H-R09-LR still passes). Non-vacuous stack revert:

```bash
node react-run.mjs --only=H-R09-LR --runs=10 --v9-quickbar-live-resolve-off --chrome-dom-ready-off
# → FAIL-REAL-BUG (all 10 fail — lagClass=true, v9BarVisible=false)
```

Recommend Lane 4 document dual-switch OFF as H-R09-LR discriminator until a single-knob lag pin is isolated.

### Lag signature (remaining 1/10 on H-R09-LR)

```json
{"lagClass":true,"storeSelected":true,"focusedOk":true,"barVisible":false,"liveNull":true,"domReadyCached":false}
```

Same D-024 class; acceptance rows **H-R09** and **H-R04** now **10/10** on b42.

---

## 6. Lane 4 handoff

1. Pull build **`20260717b42`** — verify host + iframe `__TALARIA_CHART_BUILD_ID`.
2. Register **H-R09-LR** in `gate:react` / `known-failing` reconciliation.
3. Re-run full suite + manager gate vs blessed baseline.
4. **H-R05** — 8/10 on this run (pre-existing dom-ready flake class); confirm no regression vs b03/b16 baseline before bless.

---

## 7. Build command

```bash
cd "chart v 1.4/talaria-design"
BUILD_ID=20260717b42 npm run build:live
```
