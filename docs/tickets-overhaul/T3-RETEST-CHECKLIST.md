# T3 Retest Checklist — Multichart Interaction Parity (RC-4)

**Task:** T3 step 0 (Lane 2) — retest-first triage. **No fixes in this step.**

**Build under test:** `20260707b105` or later.

**Production tree:** `chart v 1.4/chart/multichart-prod/` (and live app). Do **not** use legacy `chart v 1.4/chart/multichart/` dev-shell (L2).

**Multichart subset enumerated (24 tickets):**

| Group | Tickets | Rationale |
| --- | --- | --- |
| July-4 batch | `TAL-01480` … `TAL-01502` (21 rows, cluster `multichart_layouts`) | Filed after plan-1 data overhaul; primary RC-4 interaction-parity gaps |
| Older unresolved | `TAL-01426`, `TAL-01440`, `TAL-01536` | Open / `user_replied` multichart rows outside the batch |

**Excluded (76 rows):** pre-July-4 `multichart_layouts` tickets already `resolved`/`closed` on builds before b105. Disposition unchanged unless reopened.

**Worker confirmation:** No engine files edited. Legacy `multichart/` not touched.

---

## Step 0 — Build-ID confirmation (L1) — run before EVERY ticket row

Stale tabs were plan-1's single biggest source of false "fix didn't work" reports. **Do not record pass/fail until every frame reports the expected build.**

### Clean-load procedure

1. Close **all** Talaria chart tabs.
2. DevTools → Application → Service Workers → **Unregister** every SW for the origin.
3. DevTools → Application → Storage → **Clear site data** (cache, localStorage, IndexedDB).
4. Reopen the chart URL. If a **"new version — reload"** toast appears, use it (hard-unregisters SW + clears caches before reload).
5. Reload once more. Wait for all panels to finish booting.

### Read build id on every frame

| Frame | How to read | Record |
| --- | --- | --- |
| **Host** (main tile / panel A) | DevTools console on the top document: `window.__TALARIA_CHART_BUILD_ID` | ________ |
| **Each panel iframe** (B, C, D) | DevTools → top bar **frame/context selector** → pick the panel iframe → console: `window.__TALARIA_CHART_BUILD_ID` | B: ________ C: ________ D: ________ |

**Expected:** every value is `20260707b105` or later (same string on host + all panels).

**If any frame is stale:** repeat clean-load (unregister SW / clear site data / close tabs / reopen / reload twice). **Stop** — do not test until all frames match.

### Terminology (tester ↔ ticket language)

| Ticket says | Production means |
| --- | --- |
| Main chart / layout 1 / primary | **Host panel A** (parent frame) |
| Second layout / other layout / secondary chart | **Panel B** (first iframe; repeat on C/D when ticket says "other layouts") |
| Reply | **Replay** |
| Blue arrow | Replay **step-forward** control |
| All options enabled | Layout sync menu: **Symbol + Interval + Crosshair + Data range** all ON |
| Data range | **Visible-range sync** (data-range option in layout/sync settings) |

### Common 2-panel setup (unless a row says otherwise)

1. Open multichart. Layout picker → **2 panels** (1×2 or 2×1).
2. Confirm build ids (table above).
3. **Panel A (host):** e.g. EURUSD, 1m. **Panel B:** same symbol 1m unless the row requires different symbols/timeframes.
4. Click a panel to **focus** it (blue border) before panel-specific actions.
5. Note focused panel in results.

---

## Summary table

| Ticket | Registry status | Hypothesis tag | One-line pass/fail criterion |
| --- | --- | --- | --- |
| TAL-01426 | user_replied | LIKELY-SURVIVES | Compare Symbol from panel B applies to B, not host A; popup Close works |
| TAL-01440 | open | NEEDS-TESTER-CLARIFICATION | Crosshair snap-to-candles follows magnetic-snap setting consistently across panels |
| TAL-01480 | open | DEFER-T8 | Same-symbol panels: no spurious re-render/jump/misalignment during TF change or replay |
| TAL-01481 | closed | LIKELY-FIXED-b105 | Replay playing + charts synced: no stray step-forward arrow on panel B |
| TAL-01482 | pending | OUT-OF-SCOPE-FEATURE | News panel presence matches agreed product rule on every panel vs host-only |
| TAL-01483 | resolved | RETEST-CONFIRM | Zoom affects focused panel only when data-range sync OFF; both zoom when data-range ON |
| TAL-01484 | open | LIKELY-FIXED-b105 | Zoom/reset repaints immediately without extra tap on chart |
| TAL-01485 | closed | LIKELY-SURVIVES | Switching focus between panels does not leave crosshair stuck on unfocused panel |
| TAL-01486 | closed | LIKELY-FIXED-b105 | Symbol sync changes panel B promptly when symbol sync enabled |
| TAL-01487 | closed | LIKELY-SURVIVES | Top-left market label updates to match focused panel's symbol |
| TAL-01488 | open | DEFER-T8 | Ctrl+R during replay resets cleanly without click-to-unstick; replay keeps advancing |
| TAL-01489 | open | DEFER-T8 | Tapping panel B does not glitch layout; stable after replay start and layout switches |
| TAL-01490 | open | LIKELY-FIXED-b105 | Step-forward on host updates panel B viewport without requiring click on B |
| TAL-01491 | open | LIKELY-SURVIVES | Drag-pan on host stops at frame edge; drag-pan on panel B is not artificially clipped |
| TAL-01493 | closed | LIKELY-SURVIVES | Switching back to layout 2 restores panel B's chart name, not host's name |
| TAL-01495 | open | LIKELY-SURVIVES | Rectangle drawn on panel B stays on B's symbol only; no flash on other symbols |
| TAL-01496 | open | DEFER-T8 | Data-range sync ON: clicking either panel does not glitch positions / desync time |
| TAL-01497 | resolved | DEFER-T8 | Replay on: switch A→B→A — panel B price does not freeze for seconds |
| TAL-01498 | open | LIKELY-SURVIVES | Ctrl+click multi-select on panel B selects distinct tools, not one stacked blob |
| TAL-01499 | open | LIKELY-SURVIVES | Quick Menu appears immediately after drawing a tool on panel B |
| TAL-01500 | open | LIKELY-SURVIVES | Indicator toggles on layout 2 reflect true on-state first click; no ghost enabled rows |
| TAL-01501 | open | LIKELY-SURVIVES | Indicators deleted on layout 2 do not reappear when switching back to layout 1 |
| TAL-01502 | open | LIKELY-FIXED-b105 | On first 2-panel boot, same symbol shows matching price scale (not just matching candle shape) |
| TAL-01536 | open | OUT-OF-SCOPE-RC4 | Strategies page design consistent after page navigation (not a chart-panel interaction bug) |

---

## Per-ticket repro scripts

> **Per row:** complete Step 0 build-id table first. Then run the script. Mark `PASS` / `FAIL` / `SKIP` + build ids recorded.

---

### TAL-01426 — Compare Symbol targets wrong panel

**Registry:** `user_replied` | **Subject:** Layouts  
**Original symptom:** Compare Symbol from main chart works. From another layout, a popup appears; Close does not work; picking a symbol applies to **main chart** instead of the current layout. Tester follow-up: "not resolved."

**Hypothesis:** `LIKELY-SURVIVES`

**Setup:** 2 panels. A = EURUSD 1m. B = GBPUSD 1m (different symbols). Sync: symbol **OFF**, others default OFF.

**Repro:**

1. Focus **panel A**. Add Compare Symbol from chart UI → pick e.g. USDJPY. **Observe A.**
2. Focus **panel B**. Add Compare Symbol → popup appears.
3. Click **Close** on popup. **Observe:** popup dismisses.
4. Focus **panel B** again. Add Compare Symbol → pick e.g. XAUUSD. **Observe which panel** receives the compare overlay.

**Pass:** Close works; compare symbol applies to **panel B only**, host A unchanged.  
**Fail:** Close dead; symbol lands on A; or compare missing on B.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01440 — Crosshair snap vs magnetic snap

**Registry:** `open` | **Subject:** Layouts  
**Original symptom:** "Why isn't the crosshair snap to candles linked to the magnetic snap option?"

**Hypothesis:** `NEEDS-TESTER-CLARIFICATION` — ticket is a product question, not a clear defect. Retest documents current behavior for Director/PO.

**Setup:** 2 panels, same symbol 1m. Magnetic snap **ON** in settings.

**Repro:**

1. Enable **crosshair snap to candles** (if separate toggle exists, ON).
2. Move crosshair on **panel A** near candle bodies — note snap behavior.
3. Toggle **magnetic snap OFF** — repeat on A.
4. Repeat steps 1–3 on **panel B**.
5. Switch focus A↔B — confirm whether snap settings are shared or per-panel.

**Pass (document only):** Record whether snap-to-candles tracks magnetic snap on host + panels consistently.  
**Fail (if defect intended):** Snap behavior diverges between panels or ignores magnetic snap without documented reason.

**Clarification needed:** Should snap-to-candles be hard-linked to magnetic snap globally, or independent per panel?

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01480 — Re-render / replay jump on same symbol

**Registry:** `open` | **Subject:** Layouts/chart  
**Original symptom:** On same symbol (same or different TFs): spurious re-rendering; during replay — sudden jump, candle misalignment, large gaps; replay does not work with other layouts; worse with Candle Replay than Tick Replay.

**Hypothesis:** `DEFER-T8` — mechanism smells like replay mirror-frame adoption (data + X + Y), not interaction-surface parity. **Not a T3 fix; not guard #21.**

**Setup:** 2 panels. **Same symbol** EURUSD. A = 1m, B = 5m. Sync: interval OFF, symbol ON (same pair). Replay: **Candle** mode.

**Repro:**

1. Boot layout; wait 10s idle. **Observe:** no full-panel flash/reload on B when A idle.
2. On **host A**, change TF 1m → 15m → 1m. **Observe B** for jump/misaligned candles/gaps.
3. Start **replay** on A. Let play 30s. **Observe B** — advances with A, candles aligned to 5m buckets.
4. Stop replay. Switch B to **1m** (finer). Resume replay 30s. **Observe** jump/gaps.
5. Repeat steps 3–4 with **Tick replay** mode.

**Pass:** No spurious full re-render; replay keeps B aligned; no persistent gaps; B follows replay.  
**Fail:** Jump, misalignment, gaps, or B frozen during replay.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01481 — Stray replay arrow on synced second chart

**Registry:** `closed` | **Subject:** Layouts right arrow  
**Original symptom:** Replay enabled, two charts move together, step-forward arrow appears on second chart even though they move together. Tester later: refresh stopped the problem.

**Hypothesis:** `LIKELY-FIXED-b105`

**Setup:** 2 panels, same symbol 1m. All sync **ON**. Replay playing.

**Repro:**

1. Start replay play on host; confirm B follows.
2. **Observe panel B chrome** for a step-forward (blue) arrow indicator while both panels are synced and advancing.
3. Repeat after clean-load (no manual refresh mid-test).

**Pass:** B advances with host; **no** extra/stray step-forward arrow on B.  
**Fail:** Arrow visible on B while synced play runs.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01482 — News panel on every chart vs host only

**Registry:** `pending` | **Subject:** layout news  
**Original symptom:** Arabic: "Must news be on every chart or only the main?" → "they must be in every chart" → "ok do it". Feature request, not a regression.

**Hypothesis:** `OUT-OF-SCOPE-FEATURE` — product decision for PO, not RC-4 retest failure.

**Setup:** 2 panels, any symbol.

**Repro:**

1. Open **news panel** on host A — note visibility.
2. Focus B — open news (if control exists per-panel).
3. Record whether news appears on A only or on each panel.

**Pass:** Matches PO's stated rule ("every chart").  
**Fail:** Implementation contradicts agreed rule.  
**Or:** `SKIP` — pending product sign-off.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01483 — Zoom independent vs data-range coupled

**Registry:** `resolved` | **Subject:** layout zoom in/out  
**Original symptom:** Zoom only affects selected chart unless data-range enabled — then both must zoom together.

**Hypothesis:** `RETEST-CONFIRM`

**Setup:** 2 panels, same symbol 1m.

**Repro A (sync OFF):**

1. Data-range sync **OFF**. Focus A. Zoom in (wheel or toolbar) 3 steps. **Observe B** — should not zoom.
2. Focus B. Zoom in 3 steps. **Observe A** — should not zoom.

**Repro B (data-range ON):**

3. Data-range sync **ON**. Focus A. Zoom in 3 steps. **Observe B** — should zoom too.

**Pass:** Independent when OFF; coupled when ON.  
**Fail:** Wrong panel zooms or coupling ignores data-range toggle.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01484 — Stuck until click after zoom/reset (all sync on)

**Registry:** `open` | **Subject:** layout stuck until click on screen  
**Original symptom:** With all sync options enabled, zoom or reset only takes effect after tapping the screen.

**Hypothesis:** `LIKELY-FIXED-b105` (invalidation / boot-settle — RC-2 family; may be fixed without T3 interaction work)

**Setup:** 2 panels, same symbol 1m. **All sync ON.**

**Repro:**

1. Focus A. Zoom in 2 steps. **Do not click chart body.** **Observe A and B** — immediate repaint?
2. Press chart **Reset** (Ctrl+R or toolbar). **Without further click**, observe A and B.
3. Repeat focused on **B** (zoom + reset).

**Pass:** Viewport updates on all synced panels **immediately** without extra tap.  
**Fail:** Frozen view until chart body clicked.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01485 — Crosshair stuck on other chart

**Registry:** `closed` | **Subject:** layout crosshair stuck on other chart  
**Original symptom:** Switching between two charts leaves crosshair stuck — annoying.

**Hypothesis:** `LIKELY-SURVIVES`

**Setup:** 2 panels, same symbol 1m. Crosshair sync **ON**.

**Repro:**

1. Hover **panel A** — crosshair visible on A (and B if synced).
2. Click to focus **panel B**. Move mouse on B only.
3. Click to focus **panel A** again.
4. Repeat 5× rapidly.

**Pass:** Crosshair follows focused panel; no frozen crosshair on unfocused panel.  
**Fail:** Stale crosshair remains on the other panel after focus switch.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01486 — Slow symbol sync on second chart

**Registry:** `closed` | **Subject:** layout symbol  
**Original symptom:** Two different symbols; clicking symbol option takes long time for second chart to match.

**Hypothesis:** `LIKELY-FIXED-b105`

**Setup:** 2 panels. A = EURUSD, B = GBPUSD. Symbol sync **ON**.

**Repro:**

1. Focus A. Open symbol picker → select **USDJPY**. Start timer.
2. **Observe B** — time until B shows USDJPY and data loads (subjective: "prompt" = within ~2s on normal network).
3. Repeat A → **XAUUSD**.

**Pass:** B updates promptly without prolonged stale symbol.  
**Fail:** Multi-second lag or B never catches up without extra clicks.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01487 — Symbol label stuck in top-left market

**Registry:** `closed` | **Subject:** layout symbol stuck on left  
**Original symptom:** Symbol changes on chart but top-left market label does not update.

**Hypothesis:** `LIKELY-SURVIVES`

**Setup:** 2 panels, different symbols, symbol sync OFF.

**Repro:**

1. Focus **panel B** (GBPUSD). Change symbol to **EURUSD** via chart symbol control.
2. **Observe top-left market** name/label on the shell chrome.
3. Focus A, change symbol. Observe label again.

**Pass:** Top-left market label tracks **focused panel's** symbol.  
**Fail:** Label stuck on previous symbol while chart canvas updated.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01488 — Reset glitch during replay

**Registry:** `open` | **Subject:** layout Reset  
**Original symptom:** (1) Replay ON + Ctrl+R → glitch persists until chart clicked. (2) Replay ON + Ctrl+R → chart should keep moving without clicking blue arrow.

**Hypothesis:** `DEFER-T8` — replay reset + mirror-frame re-application; defer mirror-policy to T8 per I11.

**Setup:** 2 panels, same symbol 1m, replay **playing**.

**Repro:**

1. Let replay play 20s on A (B following).
2. Press **Ctrl+R** (reset) **3 times** without clicking chart canvas.
3. **Observe:** glitch (frozen/jump/blank) without further click?
4. After reset, **observe** whether replay **continues advancing** without clicking step-forward.

**Pass:** Clean reset; replay resumes/advances without extra click.  
**Fail:** Glitch until click; replay stuck until blue arrow clicked.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01489 — Second layout glitches on tap

**Registry:** `open` | **Subject:** layouts - click on chart  
**Original symptom:** More than one layout: tapping screen causes second layout glitch. Appears when using Replay or switching layouts.

**Hypothesis:** `DEFER-T8` — tap-triggered mirror/viewport adoption glitch; policy table territory.

**Setup:** 2 panels, same symbol 1m.

**Repro:**

1. **Without replay:** click empty chart area on **B** 5×. **Observe** visual glitch (flicker, jump, wrong range).
2. Start **replay** on A. Click **B** once. **Observe** glitch.
3. Switch focus A→B→A three times during replay. **Observe B**.

**Pass:** B remains stable; no flicker/jump/wrong viewport on tap or layout switch.  
**Fail:** Glitch on tap or layout switch (as originally reported).

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01490 — Second chart stuck until click after step-forward

**Registry:** `open` | **Subject:** layout don't moves until click on chart  
**Original symptom:** Move main chart, click blue arrow (step-forward) — second chart doesn't revert/update unless you click on it.

**Hypothesis:** `LIKELY-FIXED-b105`

**Setup:** 2 panels, same symbol 1m. Replay **paused** at some candle. Pan A so viewport differs from B.

**Repro:**

1. Pan **host A** left/right.
2. Click **step-forward (blue arrow)** once.
3. **Without clicking B**, observe whether B's viewport/candles update to follow.
4. Repeat with replay **playing** 10s.

**Pass:** B updates immediately after step-forward without click on B.  
**Fail:** B frozen until B receives a click.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01491 — Drag stops at frame box (host only)

**Registry:** `open` | **Subject:** layout frame box  
**Original symptom:** Drag chart outside outline frame on **primary** — pan stops at frame edge. Drag from **secondary** — moves outside frame normally.

**Hypothesis:** `LIKELY-SURVIVES`

**Setup:** 2 panels, same symbol 1m. Replay off.

**Repro:**

1. Focus **host A**. Drag chart canvas **hard left** until you would exit the visible chart area / panel chrome boundary. Note whether pan **stops early** at an inner box.
2. Focus **panel B**. Repeat same drag distance and direction.

**Pass:** A and B have **equivalent** pan range; host is not uniquely clipped at an inner frame box.  
**Fail:** Host pan stops at artificial inner boundary while B pans freely.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01493 — Chart name doesn't revert on layout switch

**Registry:** `closed` | **Subject:** layouts / chart name  
**Original symptom:** Two different charts; second keeps its name. Click layout1 — name doesn't revert to original layout when returning to second chart.

**Hypothesis:** `LIKELY-SURVIVES`

**Setup:** 2 panels. A = EURUSD, B = GBPUSD (different symbols). Note default chart names in panel headers.

**Repro:**

1. Focus B — confirm header shows **GBPUSD** (or B's name).
2. Focus A — confirm header shows **EURUSD**.
3. Focus B again — header should still show **GBPUSD**, not A's name.
4. If layout **tabs** exist (layout1/layout2), switch tab away and back — repeat name check.

**Pass:** Each panel header keeps its own chart name across focus/tab switches.  
**Fail:** B's name overwritten by A's and does not revert.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01495 — Drawing appears on wrong symbol's panel

**Registry:** `open` | **Subject:** layout drawing different symbol  
**Original symptom:** Each symbol on its own chart; draw rectangle — it **appears on other symbols** briefly then disappears.

**Hypothesis:** `LIKELY-SURVIVES`

**Setup:** 2 panels. A = EURUSD 1m, B = GBPUSD 1m. Symbol sync **OFF**.

**Repro:**

1. Focus **panel B**. Select **Rectangle** drawing tool.
2. Draw one rectangle on B's canvas.
3. **Watch A** during and for 2s after mouse-up — any rectangle flash on A?
4. Confirm rectangle **persists only on B** and only on GBPUSD.

**Pass:** Drawing never appears on A; stable on B only.  
**Fail:** Flash/multi-panel appearance or wrong-panel persistence.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01496 — Data-range sync glitches positions

**Registry:** `open` | **Subject:** layout data range  
**Original symptom:** Data range enabled + click any chart → glitches, positions change. Arabic: "Can't make both charts same / same time."

**Hypothesis:** `DEFER-T8` — visible-range mirror adoption across panels.

**Setup:** 2 panels, same symbol 1m. **Data-range sync ON** (interval + symbol ON optional).

**Repro:**

1. Pan A to a specific date range. Confirm B matches.
2. Click **panel B** body once (no drag). **Observe** both viewports — jump/glitch?
3. Pan B slightly. Click **panel A**. **Observe** alignment.
4. Record whether both panels show the **same time window** without drift.

**Pass:** Clicking either panel does not glitch positions; ranges stay matched.  
**Fail:** Click causes jump/desync; cannot keep identical time alignment.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01497 — Price freeze switching layouts during replay

**Registry:** `resolved` | **Subject:** layout / switch between layouts  
**Original symptom:** Two different charts + replay: click first chart, switch to second, switch back — price **freezes for seconds** on second chart.

**Hypothesis:** `DEFER-T8`

**Setup:** 2 panels. A = EURUSD 1m, B = GBPUSD 1m. Replay **playing** on host.

**Repro:**

1. Focus **A** 5s while replay runs.
2. Focus **B** — watch live price / last candle update continuously.
3. Focus **A** again, then **B** — any multi-second freeze on B?

**Pass:** B's price/candle updates continuously; no multi-second freeze on layout switch.  
**Fail:** B freezes 2+ seconds after focus switch during replay.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01498 — Ctrl-select groups tools on panel

**Registry:** `open` | **Subject:** layout / select with ctrl  
**Original symptom:** Ctrl+select on main chart works. On other layouts, all tools group into one place.

**Hypothesis:** `LIKELY-SURVIVES`

**Setup:** 2 panels, same symbol 1m. Draw **two separated trendlines** on **panel B** (not on A).

**Repro:**

1. Focus **panel A**. Ctrl+click trendline 1, then trendline 2 (if any on A) — normal multi-select.
2. Focus **panel B**. Ctrl+click line 1, then line 2.
3. **Observe** selection handles — distinct geometries vs stacked at one point.

**Pass:** B multi-select matches host behavior; handles stay on each tool.  
**Fail:** All selected tools collapse to one stacked location on B.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01499 — Quick Menu missing on panel

**Registry:** `open` | **Subject:** layout / quick menu  
**Original symptom:** Multiple charts: draw any tool — Quick Menu does **not** appear immediately. Single chart: Quick Menu **does** appear.

**Hypothesis:** `LIKELY-SURVIVES`

**Setup:** Compare **1-panel** vs **2-panel** layouts, same symbol 1m.

**Repro A (control — should pass):**

1. Layout = **1 panel**. Draw **trendline**. **Observe** Quick Menu near tool within 1s of mouse-up.

**Repro B (bug row):**

2. Layout = **2 panels**. Focus **B**. Draw **trendline** on B. **Observe** Quick Menu on B within 1s.

**Pass:** Quick Menu appears on B same as single-chart case.  
**Fail:** No Quick Menu on B (or delayed until extra click).

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01500 — Indicator toggle state wrong on layout switch

**Registry:** `open` | **Subject:** layouts / indicator  
**Original symptom:** Put indicator on layout 1, move to layout 2 — indicator appears but first click on indicator list doesn't show them as ON (need second click). Arabic: add indicators on layout 2, delete them — they stay enabled in indicator list.

**Hypothesis:** `LIKELY-SURVIVES`

**Setup:** 2 panels, same symbol 1m.

**Repro:**

1. Focus **A**. Add **RSI** (or any overlay). Confirm visible + list shows ON.
2. Focus **B**. Open indicator list — note whether RSI shows enabled **on first open**.
3. Click indicator toggle once — does UI match actual chart state?
4. On **B**, add **MACD**, then **remove** it. Open indicator list — MACD still shown enabled?

**Pass:** List on-state matches chart on first click; deleted indicators absent/disabled in list.  
**Fail:** Requires double-click to show ON; ghost enabled entries after delete.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01501 — Deleted indicators reappear on layout switch

**Registry:** `open` | **Subject:** layout / indicator appear  
**Original symptom:** Add indicators on second chart, delete them, switch to layout1 — deleted indicators **reappear**.

**Hypothesis:** `LIKELY-SURVIVES`

**Setup:** 2 panels, same symbol 1m.

**Repro:**

1. Focus **B**. Add **RSI + MACD**. Confirm both visible.
2. Remove **both** from B. Confirm chart clean.
3. Focus **A** (layout 1). **Observe** indicators — any RSI/MACD visible?
4. Switch back to **B** — confirm still absent.

**Pass:** Deleted B indicators never appear on A; stay deleted on return to B.  
**Fail:** Indicators deleted on B reappear on A or return on B.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01502 — Price mismatch on first 2-panel boot

**Registry:** `open` | **Subject:** layouts candle  
**Original symptom:** First time placing two charts: **price not the same** but candlestick **pattern** looks the same.

**Hypothesis:** `LIKELY-FIXED-b105` (boot-commit / price-scale settle)

**Setup:** **Clean load** (Step 0). Fresh 2-panel layout. **Same symbol** e.g. EURUSD 1m on A and B.

**Repro:**

1. Immediately after first boot (within 5s), read **last price** or right-edge price label on **A** and **B**.
2. Compare numeric price (not just candle shape). Screenshot both.
3. Wait 30s without clicking. Re-read prices.

**Pass:** A and B show **matching price** (or difference within one tick) on first boot.  
**Fail:** Same pattern but clearly different price scale/values on first paint.

`RESULT: __ / build id confirmed: host __ / B __`

---

### TAL-01536 — Strategies page design drift

**Registry:** `open` | **Subject:** Strategies  
**Original symptom:** Switching pages and returning to Strategies — noticeable design difference; suggestions for parameters/layout improvements.

**Hypothesis:** `OUT-OF-SCOPE-RC4` — journal/strategies UI polish, not multichart panel interaction parity.

**Setup:** Navigate away from Strategies (e.g. Chart → Strategies → Chart → Strategies).

**Repro:**

1. Open **Strategies** page. Screenshot layout.
2. Navigate to **Chart**, then back to **Strategies**.
3. Compare design consistency (spacing, parameters panel, etc.).

**Pass / Fail:** PO design judgment. For T3 RC-4 triage, mark `SKIP-RC4` unless a chart-panel interaction regression is found.

`RESULT: __ / build id confirmed: N/A (not a chart frame) __`

---

## DEFER-T8 tickets (mirror-frame policy — T8 only, never guard #21)

| Ticket | One-line reason |
| --- | --- |
| TAL-01480 | Same-symbol re-render + replay jump/misalignment/gaps = replay mirror frame (data/X/Y adoption), not interaction-surface ownership |
| TAL-01488 | Ctrl+R during replay → viewport/playhead re-application through mirror frame |
| TAL-01489 | Tap/layout-switch glitch during replay = frame application timing on peers |
| TAL-01496 | Data-range (visible-range) sync click glitches = adopt-X policy across panels |
| TAL-01497 | Price freeze on layout switch during replay = mirror playback state on peer panels |

---

## Worker deliverable checklist

- [x] `T3-RETEST-CHECKLIST.md` with build-id procedure + one repro section per enumerated multichart ticket
- [x] Summary table: ticket → hypothesis tag → one-line criterion
- [x] DEFER-T8 list with one-line reasons (no fix design)
- [x] Explicit confirmation: **no engine files edited**; legacy `multichart/` **not touched**

**PO / tester:** Record results in this file or `MANAGER-FINDINGS.md`. Tickets that **PASS** on b105+ → registry `tester-confirmed-fixed`. Tickets that **FAIL** → enter T3 steps 1–3 (interaction-parity contract + harness + gated fix). `DEFER-T8` failures → queue for T8 policy table, not T3 guards.
