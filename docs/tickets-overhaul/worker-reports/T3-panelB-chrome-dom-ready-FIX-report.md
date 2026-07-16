# T3 — panel-B chrome DOM-ready FIX (D-024)

## 1. Task + RC

- **Task:** `T3-panelB-chrome-dom-ready-FIX-lane1-D024` — stop parent chrome “ready” signal from firing before `#tl-sett` DOM commit + handler bind.
- **RC:** Harness crossroads / D-024 — H-R04 panel-B dbl-click settings and H-R05 Esc setup flakes on build `20260716b10` (timing lie, not broken transport).

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx` | `multichartChromeDomReadyV4Enabled()`; `v9EmitQuickBarChromeDomReady()` + `v9ClearQuickBarDomReady()`; `useLayoutEffect` rAF retry emit after bar mount; `onV9Sel` double-rAF emit; focused-panel guard before emit. |
| `chart v 1.4/chart/modules/drawing-tools-manager.js` | `multichartChromeDomReadyV4Enabled()`; suppress premature `_emitV9QuickBarGearReady` parent dispatch from iframe when V4 ON (companion to post-DOM emit). |
| `chart v 1.4/chart/multichart-prod/multichart-manager.js` | Gate `multichart-drawing-selected` peer `clearDrawingUiOnOtherPanels` when V4 ON (Grid React path owns routing until DOM ready). |
| `homepage/public/chart/modules/drawing-tools-manager.js` | **I8 mirror** — byte-identical to chart tree. |
| `homepage/public/chart/multichart-prod/multichart-manager.js` | **I8 mirror** — byte-identical to chart tree. |

**SHA256**

| File | SHA256 |
|------|--------|
| `multichart-manager.js` (both trees) | `EEB5587711B723853E549DC289B926A56DAD2A41957AEFCD4A941C347152A966` |
| `drawing-tools-manager.js` (both trees) | `D5B0F4763A8A7632D0C869DDD6B305B76130E90103E1609BA258FBC9B4E5B10A` |

`TalariaV8bLive.jsx` ships via `npm run build:live` → `dist-v9` (no separate homepage source mirror).

**Harness:** temporary `--chrome-dom-ready-off` hook used for switch-OFF proof only — **reverted** (Lane 4 owns permanent hook).

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4`
- **Default:** unset → fix **ON**
- **OFF behavior:**
  - Iframe `_emitV9QuickBarGearReady` resumes premature parent `talaria:v9-quickbar-gear-ready` dispatch (`drawing-tools-manager.js`)
  - `TalariaV8bLive` skips post-DOM emit / `__talariaV9QuickBarDomReady`
  - `multichart-manager` resumes immediate `clearDrawingUiOnOtherPanels` on `multichart-drawing-selected`
- **Harness flag (Lane 4):** `REACT_PARITY_CHROME_DOM_READY_OFF=1` or `--chrome-dom-ready-off` (documented here; not committed)

## 4. Ready-signal for Lane 4 (D-024 required)

**Primary name:** `window.__talariaV9QuickBarDomReady`

**Shape:** `{ drawingId, panelId, surface: 'v9-quickbar', domReady: true, settledAt }`

**Event:** `talaria:v9-quickbar-dom-ready` (same detail; also re-dispatches `talaria:v9-quickbar-gear-ready` with `domReady: true` for back-compat)

**DOM attribute:** `[data-v9-chrome-dom-ready="1"]` on `#tl-sett` and `[data-tlbar="1"]` when interactive

**Harness wait primitive (Lane 4 implements):**

```js
// Poll parent page until:
window.__talariaV9QuickBarDomReady?.domReady === true
  && String(__talariaV9QuickBarDomReady.drawingId) === wantId
  && document.querySelector('#tl-sett[data-v9-chrome-dom-ready="1"]')
// OR listen: talaria:v9-quickbar-dom-ready with detail.domReady && detail.drawingId match
```

Do **not** treat early iframe-only gear-ready (no `domReady: true`) as interactive.

## 5. Proof — RED → GREEN

**Build:** `20260716b10` (`BUILD_ID=20260716b10 npm run build:live`)

**Commands (fix ON, `REACT_PARITY_ISOLATE_SESSION=1`):**

```text
node react-run.mjs --only=H-R04 --runs=10
node react-run.mjs --only=H-R05 --runs=10
```

### H-R04 (fix ON)

| Batch | Result |
|-------|--------|
| Batch 1 | 9/10 PASS |
| Batch 2 (after focus-panel emit guard) | **10/10 PASS** |

```text
FINAL H-R04 PASS
runs: 'PASS,PASS,PASS,PASS,PASS,PASS,PASS,PASS,PASS,PASS'
```

### H-R05 (fix ON)

| Batch | Result |
|-------|--------|
| Batch 1 | 8/10 |
| Batch 2 | 9/10 (run 1 fail) |
| Batch 3 | 9/10 (run 1 fail) |
| Batch 4 | 7/10 |

**Pattern:** intermittent panel-B `settings open before Esc` setup fail; run 1 of each batch fails more often (cold-browser / no chrome wait in scenario — harness gap).

**Verdict:** **H-R04 meets 10/10 bar. H-R05 does NOT reach 10/10** → **STOP per D-024 acceptance** (do not force with sleeps).

### Switch-OFF A/B (temporary harness hook)

```text
node react-run.mjs --only=H-R04 --runs=10 --chrome-dom-ready-off  → 1/10 PASS (9 FAIL)
node react-run.mjs --only=H-R05 --runs=10 --chrome-dom-ready-off  → 5/10 PASS (5 FAIL)
```

Fix ON materially improves both rows vs OFF; OFF restores premature-emit + manager peer-clear race (honest A/B, not 10/10 FAIL-REAL-BUG on every run but majority FAIL).

### I15

- Real Puppeteer mouse dbl-click / Esc at iframe coordinates
- Real parent settings DOM (`hasStyleSection`, not shell proxy)

## 6. Invariants checked

| Invariant | How |
|-----------|-----|
| I3/I13 | Dedicated `__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4`; OFF reverts all three gated paths |
| I8 | `multichart-manager.js` + `drawing-tools-manager.js` mirrored |
| Scope | No settings-open transport changes; ordering only |
| D-024 | Ready-signal exposed on parent `window` + event + DOM attribute |

## 7. What I did NOT do / limits

- **H-R05 10/10 not achieved** — scenario has no `waitForV9QuickBarReady` / `__talariaV9QuickBarDomReady` wait (Lane 4 harness barrier still required).
- Did not commit harness hook (reverted after proof).
- Did not bless `gate:react` (blocked on H-R05 acceptance bar).
- Run-1 cold-start flake in isolated batches not eliminated product-side.

## 8. Live-verification handoff

Build **`20260716b10`**. Panel B: single-click trendline → confirm `#tl-sett[data-v9-chrome-dom-ready="1"]` in parent devtools → dbl-click opens settings with Style section → Esc closes. ×5.

Switch A/B: `window.__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4 = true` + reload → dbl-click before bar settle should reproduce panel-B settings miss.

## 9. Handoff to Lane 4

1. Implement `waitForParentV9ChromeDomReady(page, drawingId)` using `__talariaV9QuickBarDomReady` + `#tl-sett[data-v9-chrome-dom-ready="1"]`.
2. Wire into H-R04 (already uses gear-ready), **H-R05** (missing wait today), H-R01, H-R12.
3. Permanent `--chrome-dom-ready-off` hook → discriminator registry.
4. Re-run STEP 1 isolation ×10 all 4 chrome rows + 3× clean `gate:react` bless `b10`.

## 10. Status

**PARTIAL — STOP per D-024**

- **H-R04:** DONE (proven) — 10/10 PASS fix ON
- **H-R05:** **BLOCKED** — best 9/10; needs Lane 4 `__talariaV9QuickBarDomReady` wait in scenario (product fix alone insufficient without harness barrier on no-wait path)

**Commit + build for Lane 4/Lane 2:** see §11 after commit.

## 11. Commit

(Pending — file-scoped: `TalariaV8bLive.jsx`, `multichart-manager.js` I8, `drawing-tools-manager.js` I8 companion)
