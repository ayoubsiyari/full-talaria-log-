# D-029 — Dev-only clamp / fix parity sweep (read-only inventory)

**Authority:** D-029 rider 3 (D-010-cousin pattern) · ESC-025 origin (R2 clamp)  
**Task:** Lane 1 read-only inventory — no product, harness, or registry edits  
**RC:** RC-7 (dev/prod parity)  
**Status:** **DIAGNOSTIC-ONLY** — complete inventory + ranked batching table for post-bless `chart.js` reopen

**Related deliverables:**

| Doc | Role |
|-----|------|
| `D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md` | Turnkey implementation spec for ranked item **#1** (D029-01) |
| `worker-reports/D029-dev-only-parity-sweep-report.md` | Lane 2 worker report (same sweep, earlier pass) |

---

## 1. Question answered

> Which fixes/clamps/guards live on **dev sandbox surfaces** (`chart-host.html` and kin) but **production** (`chart-embed.html` → prod bridges + `MultichartGrid.jsx` + shipped `dist-v9`) **never received** — and which of those matter for real users?

The R2 `PRICE_AXIS_MIN_R=60` clamp was one instance. This sweep inventories **all** behavioral divergences found on dev surfaces, verifies prod is grep-clean for each, and ranks PORT candidates for batching behind the post-bless core reopen.

---

## 2. Surfaces inventoried

| Surface | Path | Role |
|---------|------|------|
| Dev panel iframe (canonical) | `chart v 1.4/chart/multichart/chart-host.html` | Primary dev sandbox per-panel embed |
| Dev panel iframe (I8 mirror) | `homepage/public/chart/multichart/chart-host.html` | Same clamps; minor comment drift vs canonical |
| Dev parent shell | `chart v 1.4/chart/multichart/multichart-shell.html` | Sandbox layout + session UI |
| Dev bridge | `chart v 1.4/chart/multichart/sync-bridge.js` | Older/smaller than prod bridge |
| **Production panel iframe** | `chart v 1.4/chart/multichart-prod/chart-embed.html` | Shipped embed boot |
| **Production bridge** | `chart v 1.4/chart/multichart-prod/sync-bridge.js` | Prod-only patches (scroll sync, plotFraction, applying window) |
| **Production embed boot** | `chart v 1.4/chart/multichart-prod/embed-bridge.js` | Clip-path race fix, heartbeat, pagehide |
| **Production React host** | `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | `import.meta.env.DEV` gates |
| **Shipped bundle** | `chart v 1.4/chart/dist-v9/assets/talaria-v9-live.js` | Grep for dev-only symbols |
| **Shared engine** | `chart v 1.4/chart/chart.js` | TF viewport helpers referenced by dev host |
| Harness | `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Stub API + focus mirror (harness-only) |

**Prod path checked for grep-clean:** `chart-embed.html`, `multichart-prod/sync-bridge.js`, `embed-bridge.js`, `panel-cmd-bridge.js`, both `chart.js` mirrors, `dist-v9` bundle — **no** `PRICE_AXIS_MIN`, **no** `drawAxes` wrap, **no** `receiveCrosshairSync` override in embed HTML.

**Reverse sweep (out of scope):** prod-only fixes in `embed-bridge.js` (drawings clip-path race ~769+) and expanded `sync-bridge.js` that never existed in dev `chart-host.html`. Prod is **ahead** on bridge hygiene; not counted as dev-only gaps.

---

## 3. Scoring key (severity × isolation)

Used for the ranked batching table (§5).

| Axis | Score | Meaning |
|------|-------|---------|
| **Severity** | **5** | Confirmed latent **production** defect with open tester tickets |
| | **4** | Likely prod gap — user-visible symptom documented, no ticket yet |
| | **3** | Regression/monitor — prod has different impl; re-port only if symptom returns |
| | **2** | Dev ergonomics / sandbox-only — no prod user impact |
| | **1** | No user symptom — scaffolding, diagnostics, or intentional dev divergence |
| **Isolation** | **5** | `chart.js` only — fits same PR/batch as R2 clamp |
| | **4** | `chart.js` multi-call-site contract |
| | **3** | Prod bridge layer (`sync-bridge.js` / `embed-bridge.js`) |
| | **2** | React host + bridge split |
| | **1** | Not portable / discard |
| **Batch score** | S × I | Higher = prioritize for post-bless batching |
| **Disposition** | | **PORT** · **MONITOR** · **COVERED** · **DISCARD** |

---

## 4. Full divergence registry

| ID | Surface (file:lines) | What the dev wrap / fix does | Prod grep-clean? | User-visible symptom if missing in prod | Proposed switch (if PORT) | Disposition |
|----|----------------------|------------------------------|------------------|-------------------------------------------|---------------------------|-------------|
| **D029-01** | `chart-host.html` **964–987** (canonical); homepage mirror **941–964** | Pre-`drawAxes` monkey-patch: if `margin.r < 60`, set `PRICE_AXIS_MIN_R = 60`, then call original `drawAxes`. Comment cites resize/VP race crushing below engine min 48. | **YES** — absent from `chart-embed.html`, prod bridges, `chart.js`, `dist-v9` | Price + time scales vanish on VP placement tile; candles edge-to-edge; chart hard to control until VP removed (**TAL-01665/01666/01667**) | `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX` (unset = ON) | **PORT** — D-029 item #1; land in `chart.js` margin contract, not verbatim wrap (`D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md`) |
| **D029-02** | `chart-host.html` **611–671** | Fake `chart.panel` object + replace `chart.dispatchScrollSync` to always emit `chartScrolled` (sandbox lacks `panelManager` / `setPanel`) | **N/A** — prod does not use dev host; equivalent lives in prod bridge | Visible-range / pan sync silent no-op in **sandbox only** | — | **COVERED** — `multichart-prod/sync-bridge.js` **~1356–1442** forces `chartScrolled` with `_multichartForced: true`, panSync, `visibleBarCount` |
| **D029-03** | `chart-host.html` **673–848** | Full `chart.receiveCrosshairSync` override: wall-clock X extrapolation; **hide** crosshair when synced time off-window (v10.2 — no edge clamp artefact) | **YES** — embed does not override; native `chart.js` `receiveCrosshairSync` (~37322+) | Cross-ticker crosshair at wrong X or misleading edge-clamped line (“chart jumped”) | `__TALARIA_DISABLE_CROSSHAIR_PLOT_FRACTION_V1` (hypothetical — **do not add** unless regression) | **COVERED (different impl)** — prod outbound crosshair attaches `plotFraction` (`sync-bridge.js` ~1196); inbound applies `usePlotFraction` (~1982–1988). **MONITOR** if cross-ticker regressions reopen |
| **D029-04** | `chart-host.html` **883–908** | TF `<select>` calls `loadDataInto(..., preserveViewport=true)` and **skips** synchronous `chart.setTimeframe` to avoid wrong-window flash from `resampleData` on stale `rawData` | **YES** — embed has no TF `<select>`; uses `panel-cmd-bridge` | Brief wrong-candle flash on TF switch in **sandbox** fetch path | — | **COVERED** — prod `setTimeframe` + `chart.js` `_captureTfSwitchViewport` / `_restoreTfSwitchViewport` / `_multichartMirrorHostTfSwitchIfReady` |
| **D029-05** | `chart-host.html` **426–482**, **491–501** | `applyCandles` / `loadDataInto` capture `_tfSwitchViewport` on TF change; restore via `_restoreTfSwitchViewport` | **N/A** — logic is in shared `chart.js`, not dev-only | TF switch loses visible window (if engine helpers absent) | — | **COVERED in engine** — helpers in shared `chart.js`; prod embed defers to panel-cmd path |
| **D029-06** | `chart-host.html` **313–327**, **462–482** | URL params `restoreStart` / `restoreEnd` one-shot visible-range restore after first data load | **YES** — prod embed ignores URL restore params | Sandbox session persistence across iframe recreate only | — | **DISCARD** — `multichart-shell.html` localStorage session is dev scaffolding |
| **D029-07** | `chart-host.html` **855–875** | `checkPanelDateConflict(meta)` + `confirm()` before loading non-overlapping file | **YES** — function **referenced but never defined** in dev host (would throw if branch hit) | Misleading “no crosshair sync” when file date ranges don’t overlap — **sandbox only** | — | **DISCARD** — incomplete dead code; optional hygiene: remove reference or implement stub |
| **D029-08** | `chart-host.html` **988–1003** | 5s `setInterval` → `reportToShell('axis-state: … margin.r=…')` diagnostic | **YES** | None — dev log noise only | — | **DISCARD** — diagnostic tied to D029-01 investigation |
| **D029-09** | `chart-host.html` **1012–1018** | `pagehide` clears axis diagnostic interval + bridge `applyingClearRaf` | **Partial** — prod `embed-bridge.js` ~1185 has pagehide for heartbeat, not axis interval | None in prod (no axis interval) | — | **DISCARD** — hygiene for D029-08 only |
| **D029-10** | `chart-host.html` **1020–1030** | Wrap `window.parent.postMessage` → local `multichart:assertion` CustomEvent for banner | **YES** | None — dev assert UI | — | **DISCARD** |
| **D029-11** | `chart-host.html` **202–290** | Module stubs: `DrawingToolsManager`, `ReplaySystem`, `userStorage` Proxy, `__multichartSandbox`, empty `CHART_API_URL` | **YES** — prod loads full module graph via embed | Sandbox cannot run without stubs; prod path different | — | **DISCARD** — sandbox boot scaffolding |
| **D029-12** | `chart-host.html` **933–953** | LEAK assertion banner on failed `multichart:assertion` | **YES** | None — dev guard UI | — | **DISCARD** |
| **D029-13** | `multichart-shell.html` **125–246** | Session save/load + `MultichartGuards.filterForbiddenFields`; guard self-test buttons | **N/A** — prod session is React/app-owned | Sandbox persistence only; price-axis leak prevention in localStorage | — | **DISCARD** — shell UI; `engine-api-guards.js` is **shared** (traps off by default) |
| **D029-14** | `multichart/sync-bridge.js` **146–212** | `MIN_BARS_TO_SHOW = 30` + `visibleBarCount === 0` → `fitToView` in visible-range align (“jump and hide” fix) | **Partial** — prod bridge has `visibleBarCount` in payloads and align paths but different structure | Blank chart after cross-panel visible-range sync | — | **COVERED** — prod `sync-bridge.js` carries evolved align + `visibleBarCount`; dev copy is stale subset |
| **D029-15** | `multichart/sync-bridge.js` **257–295** | `applying` boolean + double-rAF `applyingClearRaf` (replaces accumulating `suppressOutbound` counter) | **NO** — same pattern in prod | Panel appears “dead” after several syncs — pan events swallowed | — | **COVERED** — prod `sync-bridge.js` **~1060–1104** (`beginApplying`, `applyingClearRaf`) |
| **D029-16** | `MultichartGrid.jsx` **5607**, **5647** | `if (!import.meta.env.DEV)` — prod runs `closeDrawingSettingsPreservingSource`; dev skips for Vite ergonomics | **Intentional** — prod path differs by design | Dev: settings may stay open differently in `dev:live`; prod unaffected | — | **DISCARD** — deliberate D-010-class dev divergence, not a prod gap |
| **D029-17** | `harness/serve.mjs` **708–765** | `dispatchHarnessFocusChanged` / topbar TF pill mirror | **N/A** — harness static server | Harness parity only | — | **DISCARD** — harness-only |
| **D029-18** | Harness docs / `react-parity-lib.mjs` | `?devMultichart=2v` fast-loop entry on Vite pricing page | **N/A** | None — entry URL only | — | **DISCARD** |
| **D029-19** | `engine-api-guards.js` (both trees) | Optional setter traps when `window.__TALARIA_*` self-test flags enabled | **NOT A DIVERGENCE** — same file on prod embed path | None — traps off unless explicitly enabled | — | **NOT A DIVERGENCE** |

### Summary counts

| Disposition | Count | IDs |
|-------------|-------|-----|
| **PORT (latent prod bug)** | **1** | D029-01 |
| **MONITOR (prod has different fix)** | 1 | D029-03 |
| **ALREADY-COVERED** | 5 | D029-02, D029-04, D029-05, D029-14, D029-15 |
| **DISCARD (dev/harness scaffolding or intentional dev divergence)** | 11 | D029-06 … D029-13, D029-16 … D029-18 |
| **NOT A DIVERGENCE** | 1 | D029-19 |

**Standing-risk conclusion:** The D-010-cousin pattern is **real but narrow**. Only **one** dev-only behavioral fix hides a confirmed production defect today. The rest is superseded by prod bridge/engine work, incomplete sandbox code, or deliberate dev ergonomics.

---

## 5. Ranked batching table (severity × isolation)

Sorted for **post-bless `chart.js` reopen** planning. Only **PORT** and **MONITOR** rows carry batch scores; others are listed for completeness at rank tail.

| Rank | ID | Disposition | Severity | Isolation | **Batch score** | Batch with R2 clamp? | Action |
|------|-----|-------------|----------|-----------|-----------------|----------------------|--------|
| **1** | **D029-01** | **PORT** | **5** | **5** | **25** | **YES — item #1** | Implement per `D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md`; switch `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX`; `H-A7b-R2` multichart RED scenario |
| 2 | D029-03 | MONITOR | 3 | 3 | 9 | **NO** — bridge/engine path | Do not port dev override; if cross-ticker crosshair regressions reopen, compare prod `plotFraction` vs dev wall-clock hide-first |
| — | D029-02 | COVERED | 2 | 3 | — | No | None — prod bridge owns scroll sync |
| — | D029-04 | COVERED | 2 | 4 | — | No | None — engine TF viewport + panel-cmd |
| — | D029-05 | COVERED | 2 | 4 | — | No | None — shared `chart.js` helpers |
| — | D029-14 | COVERED | 2 | 3 | — | No | None — prod align evolved |
| — | D029-15 | COVERED | 3 | 3 | — | No | None — prod bridge has applying window |
| — | D029-06 … D029-13, D029-16 … D029-19 | DISCARD / N/A | 1 | 1 | — | No | Hygiene only (see §6) |

**Batching recommendation for Manager:**

1. **Reopen `chart.js` once** for D029-01 (authorized D-029 §2) — own gated build, own PR, **before** A6-4 / Phase 7 / other batch items.
2. **Do not expand** the first reopen PR with D029-02–05 ports — prod already covers them elsewhere.
3. **No second chart.js item** from this sweep qualifies for the same batch unless a new ticket proves a gap (none found today).
4. Optional **post-ship hygiene** (non-blocking): remove broken `checkPanelDateConflict` reference (D029-07); strip dev `drawAxes` wrap after D029-01 lands in core (avoid double-clamp in sandbox); re-sync I8 `chart-host.html` comment drift.

---

## 6. I8 mirror note

`homepage/public/chart/multichart/chart-host.html` contains the same behavioral overrides as canonical (`PRICE_AXIS_MIN_R`, `dispatchScrollSync`, `receiveCrosshairSync`). Minor text/comment drift vs `chart v 1.4/chart/multichart/chart-host.html` (~byte-level diff reported in Lane 2 pass). **Not re-synced** in this read-only task.

---

## 7. Proof methodology (this sweep)

| Method | Result |
|--------|--------|
| Line-by-line read | `chart-host.html` (1074 lines), `multichart-shell.html` (session/guard sections), dev vs prod `sync-bridge.js` headers |
| Prod grep | `PRICE_AXIS_MIN`, `drawAxes` wrap, `receiveCrosshairSync` override — **clean** on embed + prod bridges + `dist-v9` |
| Cross-check | A7b diagnostics, D-029 ruling, existing Lane 2 worker report |
| Harness runs | **None** — inventory only (I13 bless fence) |

---

## 8. Live-verification handoff

**Only D029-01 requires post-bless action:**

1. Land `chart.js` floor per `D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md`.
2. **Multichart topology** (not single-panel): place anchored VP → assert scales visible, `margin.r` ≥ 60.
3. Switch-OFF discriminator on same scenario.
4. **Mandatory:** D-026 proof-bar re-run (H-R04 + H-R05 ×10) on clamp-inclusive build.

Until then: tester workaround = remove VP tool to recover scales (D-029 §5).

---

## 9. Limits

- No gate runs, no RED/GREEN capture for non-R2 items.
- `dist-v9` checked by symbol grep, not full bundle decompile.
- **Reverse sweep not performed:** prod-only `embed-bridge.js` clip-path race fix (~769+) and other prod bridge expansions not in dev host — prod is ahead, not behind.
- Single-panel harness **cannot** validate D029-01; multichart-topology proof remains on post-bless track.

---

## 10. References

- `DIRECTOR-DECISIONS.md` — D-029 (rider 3 + item #1 authorization)
- `MANAGER-ESCALATIONS.md` — ESC-025
- `D029-R2-AXIS-MARGIN-CLAMP-IMPL-SPEC.md` — turnkey R2 implementation
- `worker-reports/D029-dev-only-parity-sweep-report.md` — Lane 2 prior pass
- `worker-reports/A7b-volume-profile-diagnostic-report.md` — R2 mechanism
- Dev clamp origin: `chart v 1.4/chart/multichart/chart-host.html` **964–987**
