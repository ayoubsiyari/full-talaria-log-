# T3 — panel-B settings transport RECONCILE (Worker 1 10/10 vs Lane 4 0–4/10)

## 1. Task + RC

- **Task:** `T3-panelB-settings-transport-RECONCILE-lane1` — resolve contradiction on build `20260716b10`: Worker 1 H-R04 **10/10** / H-R05 **9/10** (no harness dom-ready wait) vs Lane 4 H-R04 **4/10** / H-R05 **0/10** (with dom-ready wait, honest `hasStyleSection`).
- **RC:** Same build id, opposite panel-B outcomes after D-024 dom-ready landed (`2537d3d0b`).

## 2. Bundle audit — hypothesis (A) stale/incomplete dist

### Markers present in served bundles

| Marker | `chart v 1.4/.../dist-v9` | `homepage/public/chart/dist-v9` |
|--------|---------------------------|----------------------------------|
| `QuickBarDomReady` | ✅ | ✅ |
| `CHROME_DOM_READY` / `chrome-dom-ready` | ✅ | ✅ |
| `quickbar-dom-ready` | ✅ | ✅ |
| `__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4` | ✅ (minified) | ✅ (minified) |

`2537d3d0b` commit dist blob also contains `QuickBarDomReady` (verified via `git show`).

### Provenance + hashes

| Artifact | SHA256 | mtime (local) | Notes |
|----------|--------|---------------|-------|
| `talaria-v9-live.js` (both dist trees) | `790434D1E946A6593BE7A1EA990ED2809B09A4A2594619B6143B697A44699663` | 2026-07-16 21:57 | **Byte-identical** across trees |
| `TalariaV8bLive.jsx` (source) | — | 2026-07-16 21:56 | Source predates dist by ~6s |
| Last dist commit | `2537d3d0b` | 2026-07-16 22:03:23 +0100 | D-024 product + dist bump |
| `drawing-tools-manager.js` (both module trees) | `D5B0F4763A8A7632D0C869DDD6B305B76130E90103E1609BA258FBC9B4E5B10A` | — | I8 mirror match |
| HEAD at audit | `8dc152387` | — | No `TalariaV8bLive.jsx` diff vs `2537d3d0b` |

**Conclusion (A): REJECTED.** Served `dist-v9` is not stale or pre-D-024. No dist rebuild performed or required.

## 3. Measurement reconcile — hypothesis (B) false-green

### What Worker 1 actually asserted

From `T3-panelB-chrome-dom-ready-FIX-report.md` §5 I15 and `react-parity-scenarios.mjs` at `2537d3d0b`:

- **CORE assertion:** `waitForParentDrawingSettingsOpen` → `hasStyleSection === true` and `!quickBarShellOnly` (real parent Style panel, not click-dispatched or shell proxy).
- **Pre-dbl-click wait (Worker 1 era):** `waitForV9QuickBarReady` (legacy gear-ready / `#tl-sett` presence) — **not** `waitForParentV9ChromeDomReady`.
- **No** `focusReactPanelSoft` before first panel-B dbl-click (only settle on retry).

Worker 1 did **not** use a weaker proxy. Lane 4 and Worker 1 share the same honest CORE probe (`readParentReactSettings` / `hasStyleSection`).

### Side-by-side re-run (this session, build `20260716b10`, isolated fresh browser)

Diagnostic: `reconcile-probe-out.txt` (panel-B only, `hasStyleSection` CORE).

| Probe style | Pre-dbl-click sequence | Panel-B CORE pass rate |
|-------------|------------------------|------------------------|
| **Worker 1 era** | `waitForV9QuickBarReady` → dbl-click (no upfront focus) | **6/10** |
| **Lane 4 current** | `focusReactPanelSoft` + `waitForPanelSettle` + `waitForParentV9ChromeDomReady` → dbl-click | **0/10** |
| **Lane 4 evidence (full H-R04)** | Current scenarios (host leg + panel B) | **4/10** (`cdr-hr04-on-x10.txt`) |
| **Lane 4 evidence (H-R05)** | Dom-ready passes; panel-B setup always `open:false` | **0/10** (`cdr-hr05-on-x10-v2.txt`) |

**Failure signature (both styles when RED):**

```json
{"open":false,"hasStyleSection":false,"quickBarShellOnly":false}
```

**Actuation:** `double-click dispatched` / `dbl=true` on RED runs — Puppeteer dbl-click reaches the iframe; failure is **after** actuation.

**Dom-ready on Lane 4 RED runs:** `cached-state` with `panelId:"B"`, `domReady:true`, `domFlag:true` — readiness signal is honest; settings modal still does not open.

Worker 1's **10/10** batch was a **timing-lucky run**, not a false-green from a weaker assertion. Re-running the same honest probe today on the verified-fresh dist yields **6/10** (Worker 1 style), not 10/10.

## 4. Verdict

### Primary: **(B) TRANSPORT**

Panel-B iframe dbl-click → parent settings modal is a **genuine intermittent product failure** on the verified-fresh `20260716b10` dist, measured with the real modal (`hasStyleSection`). D-024 fixed chrome **readiness ordering**; it did **not** fix the separate **settings-open transport** race.

### Secondary: **(C) HARNESS** (exacerbation, not root cause)

Lane 4's added pre-dbl-click sequence (`focusReactPanelSoft` + `waitForParentV9ChromeDomReady`) **systematically worsens** panel-B success (**0/10** vs **6/10** Worker-1-style). A legitimate dom-ready wait should not invent a product bug, but here it correlates with **selection/focus churn** before dbl-click that amplifies an existing transport race. Lane 4 should revisit H-R04/H-R05 panel-B actuation order (hand off harness adjustment; no product change in this task).

**(A) BUILD:** ruled out — see §2.

## 5. Transport call path (panel B, where it should land)

```
iframe drawing-tools-manager.editDrawing(drawing, x, y)
  └─ isMultichartIframeEmbed() → requestMultichartParentDrawingSettings(drawing, x, y)
       ├─ armMultichartParentSettingsOpenGuard(panelId)   // parent __v9DrawingSettingsOpenGuardUntil
       ├─ parent.__multichartOpenShapeSettings(...)       // if present
       └─ parent.__multichartGrid.openDrawingSettingsForPanel('B', drawing, x, y)
            └─ MultichartGrid.jsx ~5281 — V9 parent settings into #multichart-global-settings-root
```

**Where it dies on RED runs:** dbl-click actuation succeeds; `openDrawingSettingsForPanel` either is not invoked in time, returns without mounting Style content, or the panel is synchronously dismissed by a peer-clear / focus side-effect before `hasStyleSection` becomes visible within the 8s harness budget. On GREEN diagnostic runs, `guardSource:"B"`, `domReady.panelId:"B"`, and parent root shows full Style text — path works when timing aligns.

**D-024 interaction:** V4 suppresses premature iframe `_emitV9QuickBarGearReady` and gates `clearDrawingUiOnOtherPanels` on `multichart-drawing-selected`. Dom-ready now fires post-DOM from `TalariaV8bLive.jsx`, but **settings-open transport** (`requestMultichartParentDrawingSettings` → `openDrawingSettingsForPanel`) remains outside D-024 scope.

## 6. Proposed escalation (STOP — beyond D-024)

| Item | Proposal |
|------|----------|
| **Ticket** | New Lane 1 transport fix — panel-B iframe dbl-click → parent V9 settings modal coalesce / guard extension |
| **Switch (I3)** | `window.__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1` (default ON = fix enabled) |
| **Likely touch** | `MultichartGrid.openDrawingSettingsForPanel` (~5281), `requestMultichartParentDrawingSettings` (~236), peer-clear / dismiss guard window (~`__v9DrawingSettingsOpenGuardUntil`) |
| **Proof bar** | H-R04 panel-B **10/10** + H-R05 panel-B **10/10** isolated ON with honest `hasStyleSection`; switch-OFF honest RED |

**Do not bless `20260716b10`** on current panel-B transport flake.

## 7. Lane 4 handoff

1. **Harness (C):** Consider removing or deferring `focusReactPanelSoft` before panel-B dbl-click on H-R04/H-R05; dom-ready wait alone may be sufficient once transport fix lands.
2. **Bless:** Blocked until transport fix or Director ruling on acceptable flake rate.
3. **Evidence files:** `reconcile-probe-out.txt`, `cdr-hr04-on-x10.txt`, `cdr-hr05-on-x10-v2.txt`.

## 8. What I did NOT do

- No product source edits.
- No harness lib / scenario edits (Lane 4 owns).
- No dist rebuild (audit showed fresh complete bundle).
- No sleeps added to probes.
