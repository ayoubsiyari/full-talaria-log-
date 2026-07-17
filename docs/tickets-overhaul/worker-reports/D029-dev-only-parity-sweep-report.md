# D-029 — Dev-only fix/clamp parity sweep (Lane 2, read-only)

**Task:** D029-dev-only-fix-parity-sweep-lane2.md  
**RC:** RC-7 (dev/prod parity) — cousin of D-010 `dev:live` lesson  
**Build context reviewed:** combined manifest `20260716b10`; production embed `chart v 1.4/chart/multichart-prod/chart-embed.html` (`20260717b11` stamp in head); dev sandbox `chart v 1.4/chart/multichart/chart-host.html`  
**Status:** **DIAGNOSTIC-ONLY** — inventory complete; no product code, harness, or registry edits.

---

## 1. Task + RC

Read-only sweep of **dev-only fixes / clamps / guards / workarounds** on dev/harness surfaces that are absent from the production multichart path (`chart-embed.html` → `sync-bridge.js` / `embed-bridge.js` / `panel-cmd-bridge.js` + `MultichartGrid.jsx` + shipped `dist-v9`). Origin: D-029 rider 3 / ESC-025 R2 finding (`PRICE_AXIS_MIN_R` lived in dev for months, never in prod).

---

## 2. What I changed — file by file

**No files touched.** Read-only comparison only.

**Surfaces inventoried:**

| Surface | Role |
|---------|------|
| `chart v 1.4/chart/multichart/chart-host.html` | Dev sandbox per-panel iframe (primary offender) |
| `homepage/public/chart/multichart/chart-host.html` | I8 mirror of dev host (see §6 — minor drift) |
| `chart v 1.4/chart/multichart/multichart-shell.html` | Dev sandbox parent shell |
| `chart v 1.4/chart/multichart/sync-bridge.js` | Dev bridge (older/smaller than prod) |
| `chart v 1.4/chart/multichart-prod/chart-embed.html` | Production panel iframe |
| `chart v 1.4/chart/multichart-prod/sync-bridge.js` | Production bridge (includes prod-only patches) |
| `chart v 1.4/chart/multichart-prod/embed-bridge.js` | Production boot / heartbeat / pagehide hygiene |
| `chart v 1.4/chart/multichart-prod/harness/serve.mjs` | Harness static + stub API |
| `chart v 1.4/talaria-design/src/MultichartGrid.jsx` | Production React host |
| `chart v 1.4/chart/dist-v9/assets/talaria-v9-live.js` | Shipped bundle (grep for dev-only symbols) |

---

## 3. Kill-switch (I3 + I13)

**N/A — read-only inventory.** One item below is already authorized post-bless with switch `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX` (D-029 §2).

---

## 4. Proof — methodology

No RED/GREEN runs (explicitly out of scope). Evidence sources:

- Side-by-side grep/read of `chart-host.html` vs `chart-embed.html` + prod bridge scripts.
- Cross-check against A7b diagnostic reports (`A7b-volume-profile-diagnostic-report.md`, `A7b-P0-anchored-VP-freeze-report.md`) and D-029 ruling text.
- `dist-v9` bundle grep: no `PRICE_AXIS_MIN`, no `DISABLE_AXIS_MARGIN` strings.

---

## 5. Divergence registry (main deliverable)

| # | Surface | Dev-only behavior | Symptom addressed | Prod has the bug? | Disposition | Manager / ticket candidate |
|---|---------|-------------------|-------------------|-------------------|-------------|----------------------------|
| **D029-01** | `chart-host.html` ~978–987 | Post-`drawAxes` wrap: `PRICE_AXIS_MIN_R = 60` floor on `margin.r` | Price/time scales vanish or candles crush edge-to-edge after VP placement / resize race (`margin.r` &lt; engine min) | **YES — latent** (TAL-01665/01666/01667; ESC-025 R2). Engine `_syncAdaptivePriceAxisMargin` min is 48px but VP redraw can still crush below usable strip in multichart topology | **PORT post-bless** — item #1 of `chart.js` batch behind `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX` (D-029 authorized). Do **not** port the dev `drawAxes` wrap verbatim; land in core margin contract | **Already tracked** — D-029, ESC-025, A7b family. RED-first multichart scenario required |
| **D029-02** | `chart-host.html` ~611–671 | Fake `chart.panel` + minimal `dispatchScrollSync` override (always emits `chartScrolled`) | Visible-range / date sync silent no-op in sandbox (no `panelManager`, no `chart.panel`) | **Was YES in early sandbox**; prod path differs | **ALREADY-COVERED** — `multichart-prod/sync-bridge.js` ~1356–1439 forces `chartScrolled` with richer payload (`_multichartForced`, panSync, plotWidthPx). Dev host duplicate is sandbox scaffolding | None |
| **D029-03** | `chart-host.html` ~673–848 | Full `receiveCrosshairSync` override: wall-clock X extrapolation + hide when synced time off-window (v10.2) | Cross-ticker crosshair at wrong X; edge-clamped line looked like chart “jumped” | **Partially** — native `chart.js` `receiveCrosshairSync` (~37322+) hides off-window (`isXVisible`) but pins X via bar index unless `opts.usePlotFraction` | **ALREADY-COVERED (different impl)** — prod `sync-bridge.js` outbound crosshair attaches `plotFraction` (~1196) and inbound applies it (~1982–1988). Dev override is obsolete relative to prod bridge + engine | Monitor only — if cross-ticker crosshair regressions reappear, compare plotFraction path vs dev wall-clock math before re-porting |
| **D029-04** | `chart-host.html` ~883–908 | TF `<select>` calls `loadDataInto(..., preserveViewport=true)` and **does not** call `chart.setTimeframe` | Flash of wrong-window candles from synchronous `resampleData` on old `rawData` during TF switch | **Mitigated in prod** via server-fetch / mirror paths, not this exact skip | **ALREADY-COVERED** — prod uses `panel-cmd-bridge.js` `setTimeframe` + `chart.js` `_captureTfSwitchViewport` / `_restoreTfSwitchViewport` / `_multichartMirrorHostTfSwitchIfReady`. Dev path is a sandbox shortcut | None unless H-S6-class TF races resurface |
| **D029-05** | `chart-host.html` ~426–482, ~491–501 | `applyCandles` + `loadDataInto` viewport capture/restore via `_tfSwitchViewport` | TF switch should preserve visible wall-clock window | Engine helpers exist in shared `chart.js`; embed fast-path intentionally skips capture | **ALREADY-COVERED in engine** — logic lives in `chart.js`; prod embed defers to panel-cmd + engine comments (~30789). Not a dev-only prod gap | None |
| **D029-06** | `chart-host.html` ~313–327, ~462–482 | URL `restoreStart` / `restoreEnd` one-shot session range restore | Sandbox session persistence across layout rebuild | N/A — prod uses React state + panel-cmd, not URL params | **DISCARD (dev-scaffolding)** — `multichart-shell.html` localStorage session is sandbox-only | None |
| **D029-07** | `chart-host.html` ~859–875 | `checkPanelDateConflict(meta)` + `confirm()` before loading non-overlapping file | Warn when panel file date range won’t sync with peers | **Broken in dev** — function is **referenced but never defined** (would throw if branch hit) | **DISCARD** — incomplete sandbox UX; prod has no equivalent (file pick is app-level) | None |
| **D029-08** | `chart-host.html` ~988–1003 | 5s `axis-state` interval → `reportToShell` diagnostic | Debug margin.r / yScale / bar count per panel | N/A | **DISCARD (dev-scaffolding)** | None |
| **D029-09** | `chart-host.html` ~1012–1018 | `pagehide` clears axis diagnostic interval + bridge RAF | Prevent stale interval after iframe teardown | Prod embed has **different** pagehide (heartbeat only in `embed-bridge.js` ~1185) | **DISCARD** — tied to D029-08 diagnostic; prod pagehide hygiene already present for boot heartbeat | None |
| **D029-10** | `chart-host.html` ~1020–1030 | `postMessage` wrapper → local `multichart:assertion` CustomEvent | Assertion banner without parent round-trip | N/A — dev assert banner UI | **DISCARD (dev-scaffolding)** | None |
| **D029-11** | `chart-host.html` ~202–290 | Module stubs (`DrawingToolsManager`, `ReplaySystem`, `userStorage` Proxy, `__multichartSandbox`, empty `CHART_API_URL`) | Run minimal chart.js in sandbox without full V9 module graph | N/A — prod loads full module graph via `chart-embed.html` | **DISCARD (dev-scaffolding)** | None |
| **D029-12** | `chart-host.html` ~933–953 | LEAK assertion banner on `multichart:assertion` | Surface sync guard violations in iframe corner | N/A | **DISCARD (dev-scaffolding)** — prod uses harness/manager counters, not iframe banner | None |
| **D029-13** | `multichart-shell.html` | Session save/load + `MultichartGuards.filterForbiddenFields`; guard self-test / diagnose buttons | Sandbox persistence without price-axis field leaks; manual guard verification | Prod session is app-owned | **DISCARD (dev-scaffolding)** — guards file exists on prod path too (`engine-api-guards.js`); shell UI is dev-only | None |
| **D029-14** | `multichart-prod/harness/serve.mjs` ~708–765 | `dispatchHarnessFocusChanged` / topbar TF pill mirror | Harness parity with V9 focus→TF label sync | N/A — not product UX | **DISCARD (harness-only)** | None |
| **D029-15** | `MultichartGrid.jsx` ~5541, ~5581 | `if (!import.meta.env.DEV)` skip `closeDrawingSettingsPreservingSource` after settings open | Dev:live ergonomics — avoid closing settings panel immediately in Vite dev | **Intentional dev-only** — prod path runs close-on-other-panels | **DISCARD** — deliberate `dev:live` divergence (D-010 class); not a prod bug | None |
| **D029-16** | Harness docs / `react-parity-lib.mjs` | `?devMultichart=2v` fast-loop entry URL | Mount multichart grid overlay in Vite pricing page | N/A | **DISCARD (harness entry)** — not a behavioral fix | None |
| **D029-17** | `engine-api-guards.js` (both trees) | Optional setter traps (`window.__TALARIA_*` enable) | Dev guard self-tests | Same file shipped to prod embed path | **NOT A DIVERGENCE** — shared artifact; traps off by default | None |

### Summary counts

| Disposition | Count | IDs |
|-------------|-------|-----|
| **PORT post-bless (latent prod bug)** | **1** | D029-01 |
| **ALREADY-COVERED** | 4 | D029-02, D029-03, D029-04, D029-05 |
| **DISCARD (dev/harness scaffolding)** | 11 | D029-06 … D029-16 |
| **NOT A DIVERGENCE** | 1 | D029-17 |

**Standing-risk conclusion:** Only **one** dev-only clamp materially diverges from production in a way that hides a real defect (D029-01 / R2). The rest is either superseded by prod bridge/engine work or pure sandbox/harness scaffolding. The D-010-cousin pattern is **real but narrow** today — not a long tail of hidden prod fixes in `chart-host.html`.

---

## 6. What I did NOT do / limits

- **No bless-path or gate runs** — inventory only.
- **`dist-v9`:** grep-only; did not unpack/minify-analyze entire bundle (no `PRICE_AXIS` / axis-floor symbols found).
- **I8 mirror:** `homepage/public/chart/multichart/chart-host.html` **differs slightly** from canonical (`fc /b` mismatch ~byte 4996 — comment/text drift). Not re-synced (read-only). Dev-only clamps present in **both** copies.
- **Reverse sweep not performed:** prod-only fixes in `multichart-prod/sync-bridge.js` / `panel-cmd-bridge.js` that never existed in dev `chart-host.html` (prod is ahead; out of D-029 scope).
- **`checkPanelDateConflict`:** confirmed undefined — dev sandbox dead code; not escalated as prod gap.
- **Single-panel harness:** cannot validate D029-01 (A7b already noted stable `margin.r=55` there); multichart-topology proof remains on post-bless track per D-029 §3.

---

## 7. Live-verification handoff

**For D029-01 only (post-bless, not this sweep):**

1. Build with `chart.js` axis-margin floor + switch `__TALARIA_DISABLE_AXIS_MARGIN_FLOOR_AFTER_VP_FIX`.
2. **Multichart topology** (not single-panel): place anchored VP on a peer panel → assert price/time scales remain visible, `margin.r` ≥ floor.
3. Switch-OFF discriminator: crush returns on same scenario.
4. Full gate + D-026 proof-bar re-run on clamp-inclusive build.

Until then, tester workaround stands: remove VP tool to recover scales (D-029 §5).

---

## 8. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I13 / bless fence | No product code touched |
| I8 (mirrors) | Noted homepage `chart-host.html` drift; no edits |
| RC-7 | Divergence registry with port/discard dispositions delivered |

---

## 9. Manager recommendations

1. **No new tickets** beyond existing A7b / D-029 R2 track for axis crush (D029-01).
2. **Close the parity-sweep work item** — blast radius is **one latent prod bug**, not a hidden queue of dev-only clamps.
3. **Optional hygiene (out of scope here):** fix or remove broken `checkPanelDateConflict` reference in dev `chart-host.html`; re-sync I8 mirror when next dev-host edit lands.
4. **Do not port** D029-02–05 from `chart-host.html` — prod already owns those concerns in bridge/engine layers.

---

## 10. References

- `docs/tickets-overhaul/DIRECTOR-DECISIONS.md` — D-029
- `docs/tickets-overhaul/MANAGER-ESCALATIONS.md` — ESC-025
- `docs/tickets-overhaul/worker-reports/A7b-P0-anchored-VP-freeze-report.md` — R2 / dev clamp origin
- `docs/tickets-overhaul/worker-prompts/D029-dev-only-fix-parity-sweep-lane2.md` — task spec
