# T0 Lane 4 — chrome DOM-ready wait primitive + bless

## 1. Task + RC

- **Task:** `T0-lane4-chrome-dom-ready-wait-primitive-plus-bless` — consume D-024 `__talariaV9QuickBarDomReady` as harness wait primitive; wire H-R01/H-R05; `--chrome-dom-ready-off` discriminator; 10/10 isolated ON + 3× clean `gate:react` → bless `20260716b10`.
- **RC:** Tooling/harness (Lane 4). Product D-024 landed by Worker 1 (`2537d3d0b`); this pass wires the harness side only.

**Build:** `20260716b10`

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/multichart-prod/harness/react-parity-lib.mjs` | Added `waitForParentV9ChromeDomReady()` (line ~767): polls `talaria:v9-quickbar-dom-ready`, `window.__talariaV9QuickBarDomReady`, or `#tl-sett[data-v9-chrome-dom-ready="1"]` (OR logic, focused-panel guard on DOM flag). `installBuiltProductBoot` sets `__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4` when `chromeDomReadyOff` / `REACT_PARITY_CHROME_DOM_READY_OFF=1`. |
| `chart v 1.4/chart/multichart-prod/harness/react-run.mjs` | `--chrome-dom-ready-off` CLI + ctx passthrough. |
| `chart v 1.4/chart/multichart-prod/harness/react-parity-scenarios.mjs` | **H-R01** `runPanelClickRow`: dom-ready wait after selection (panel B focus+settle, 12s budget). **H-R05**: `disarmDrawTool`, dom-ready before dbl-click, panel-B settings timeout 8s, settle-based dbl-click retry. **H-R04**: dom-ready before dbl-click (also wired for isolation bar). H-R01 runs panel B before host to reduce stale host-chrome cache on B probe. |
| `chart v 1.4/chart/multichart-prod/harness/HARNESS-REFERENCE.md` | D-024 discriminator rows + wait-primitive docs. |
| `homepage/public/chart/multichart-prod/harness/*` | **I8 mirror** — byte-identical copies of the four files above. |

**Evidence artifacts:** `cdr-hr01-on-x10.txt`, `cdr-hr04-on-x10.txt`, `cdr-hr05-on-x10.txt`, `cdr-hr05-on-x10-v2.txt`, `cdr-hr05-off-x3.txt`

No other files touched.

---

## 3. Kill-switch (I3 + I13)

- **Switch:** `window.__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4` (product, Lane 1)
- **Harness hook:** `--chrome-dom-ready-off` / `REACT_PARITY_CHROME_DOM_READY_OFF=1` → sets switch at boot via `evaluateOnNewDocument` (`react-parity-lib.mjs` ~462)
- **Default:** unset → fix **ON**
- **OFF observed:** dom-ready probe times out on panel B; settings probe sees `quickBarShellOnly:true` (premature shell) — honest RED, not vacuous PASS

---

## 4. Proof — RED → GREEN

### Wait primitive (implementation)

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
$env:REACT_PARITY_ISOLATE_SESSION='1'
```

### Isolation fix ON (`chromeDomReadyOff=false`)

| Row | Result | Evidence | Notes |
|-----|--------|----------|-------|
| **H-R01** | **8/10 PASS** (`PASS×6,FAIL,PASS,PASS,FAIL`) | `cdr-hr01-on-x10.txt` | FAIL-FLAKE — panel B probe timeout with **stale panel-A** `__talariaV9QuickBarDomReady` while CORE (store+V9 bar) passes |
| **H-R04** | **4/10 PASS** | `cdr-hr04-on-x10.txt` | FAIL-FLAKE — panel B: dom-ready **passes**, real dbl-click dispatched, **settings never open** (`open:false`) |
| **H-R05** | **0/10 PASS** | `cdr-hr05-on-x10.txt`, `cdr-hr05-on-x10-v2.txt` | FAIL-REAL-BUG — panel B: dom-ready **passes every run**, host leg **passes every run**, panel B `settings open before Esc` **always** `open:false` |

**I15:** Real `page.mouse` single/double-click at iframe-translated coords; measured parent settings modal (`hasStyleSection`, not quick-bar shell). No fixed `sleep()` gating CORE — settle-based dbl-click retry only on panel B.

### Discriminator OFF (`--chrome-dom-ready-off`)

| Row | Result | Evidence |
|-----|--------|----------|
| **H-R04** | **0/3 PASS** | inline run + `cdr-hr04` pattern — dom-ready timeout + `quickBarShellOnly:true` on panel B |
| **H-R05** | **0/3 PASS** | `cdr-hr05-off-x3.txt` — `FAIL,FAIL,FAIL` FAIL-REAL-BUG |

Switch-OFF produces genuine RED (non-vacuous).

### STEP 3 — bless gate

**NOT RUN** — isolation bar not met (H-R04/H-R05 not 10/10 ON). No 3× consecutive `gate:react`; manager gate not re-run; **`20260716b10` not blessed**.

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| **I8** | Harness files mirrored to `homepage/public/chart/multichart-prod/harness/` |
| **I15** | Real actuation + real settings end-state; no proxy green on CORE rows |
| **I3/I13** | Harness consumes product switch via `--chrome-dom-ready-off`; OFF flips RED |
| **Prompt honesty** | Did not add fixed sleeps or retry-until-green to force 10/10 |

---

## 6. What I did NOT do / limits

- **Did not bless** `20260716b10` — H-R05 panel B settings transport **0/10** despite dom-ready pass; H-R04 panel B **4/10**; H-R01 **8/10**.
- **Did not** run 3× `gate:react` or manager `npm run gate`.
- **Regression vs Worker 1** (`T3-panelB-chrome-dom-ready-FIX-report.md`): Worker 1 reported H-R04 **10/10** and H-R05 **9/10** ON same build **without** harness dom-ready wait. This session sees systematic panel-B **dbl-click → parent settings** failure after dom-ready passes — suggests **dist/serve regression**, incomplete D-024 in served `dist-v9`, or fresh Lane 1 escalation on settings transport (not fixable with harness waits alone).
- H-R01 panel-B probe still races host→B chrome handoff (stale `panelId:A` cache) on ~2/10 runs.

---

## 7. Live-verification handoff

Build **`20260716b10`**. Panel B: place rectangle → single-click select → confirm `__talariaV9QuickBarDomReady.domReady` **and** `#tl-sett[data-v9-chrome-dom-ready="1"]` with `panelId:B` → double-click → parent settings with Style section → Esc. Repeat ×10. If settings miss while dom-ready shows, escalate to Lane 1 (settings transport), not harness sleeps.

A/B: `window.__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4 = true` + reload → dom-ready should not settle before dbl-click; harness `--chrome-dom-ready-off` reproduces.

---

## 8. Status

**BLOCKED (isolation bar + panel-B settings transport)**

- **Harness primitive:** DONE — `waitForParentV9ChromeDomReady` + `--chrome-dom-ready-off` wired (I8).
- **Bless:** **BLOCKED** — H-R05 panel B **0/10**, H-R04 panel B **4/10**, H-R01 **8/10**; discriminator OFF RED confirmed.
- **Escalation:** Lane 1 — panel-B iframe dbl-click → parent settings modal fails **after** D-024 dom-ready signal reports ready; reconcile with Worker 1 9–10/10 baseline (possible **dist rebuild** / serve tree mismatch on `20260716b10`).
