# T8 step 10 — coarse-panel refetch + re-render on Play diagnostic report (PLAN2-FOUND#7)

## 1. Task + RC

- **Task:** `T8-step10-lane2-coarse-panel-refetch-on-play-diagnostic.md` — READ-ONLY regression check + mechanism trace for PO staging **a4**: on Play, bigger-TF multichart panels refetch and full-re-render each advance; single chart does not.
- **RC:** **Tooling/diagnostic — no RC discharged.** Step-0 verdict: **not a D-015 step-5 regression** for coarse same-pair panels. Primary track: **RC-2 / TAL-01573** (full re-render invalidation). Secondary: **pre-existing conditional refetch** via `ensureReplayDataCoversTimestamp` when mirror misses (`replay-system.js:6670–6672`).

---

## 2. What I changed — file by file

**No product or harness edits.** READ-ONLY trace + harness A/B runs only.

| File | Change |
|------|--------|
| *(none)* | Diagnostic report only |

**Explicit:** no other files touched. `react-parity-lib.mjs`, `panel-cmd-bridge.js`, `chart.js`, `replay-system.js`, `known-failing.json` — all read-only.

---

## 3. Kill-switch (I3 + I13)

**N/A — diagnostic only.**

**Step-0 A/B switch (reference):**

| Switch | Default | Effect when `true` |
|--------|---------|-------------------|
| `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE` | fix **ON** (switch unset/false) | Skips D-015 unified PLAY block (`panel-cmd-bridge.js:699`); reverts to pre-D-015 BL-10 / mirror / catch-up fall-through |

---

## 4. Proof — RED → GREEN

### Step 0 (mandatory) — regression vs pre-existing

**Question:** Does refetch/re-render on coarse panels **stop** when `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE=true`?

**Harness A/B (coarse same-pair, closest proxy to PO path):**

```text
cd "chart v 1.4/chart/multichart-prod/harness"

# Fix ON (default)
node run.mjs --only=H-S17
→ B renders during play=25 over 180 host 1m frames — PASS

# Fix OFF (revert step-5)
node run.mjs --only=H-S17 --bug --bugSwitches=__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE
→ B renders during play=25 over 180 host 1m frames — PASS (identical)

# Production tick play (pending dev scenario)
node run.mjs --pending --only=H-S59b-coarse
→ B replayTs advances (delta=780000) — PASS

node run.mjs --pending --only=H-S59b-coarse --bug --bugSwitches=__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE
→ B replayTs advances (delta=780000) — PASS (identical)
```

| Metric | Fix ON | Fix OFF (`__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE`) |
|--------|--------|--------------------------------------------------------|
| H-S17 coarse B renders / 180 frames | **25** | **25** (no delta) |
| H-S17 playhead advance | yes | yes |
| H-S59b-coarse production tick advance | yes | yes |

**Static code comparison (coarse same-pair, sync OFF, `args.isPlaying`):**

| Path | D-015 ON (`:699–740`) | D-015 OFF (falls through to `:806–830`) |
|------|----------------------|----------------------------------------|
| Coarse peer (panel TF > host TF) | `scheduleCoalescedSeek(ch, ts, false)` — `peerPlayMustStayOnOwnMaster` returns **false** (`:728–736`) | `scheduleCoalescedSeek(ch, ts, false)` — same (`:830`) |
| Mirror-first coalesced seek | yes (`:1967–1975`) | yes (same function) |
| Early return before catch-up breaker | yes (unified block) | yes (coarse branch returns `:833`) |

**Step-0 verdict:** **NOT a step-5 regression** for coarse same-pair panels. Switch A/B does **not** isolate a new refetch or render storm. Symptom is **pre-existing** — aligns with step-4 diagnostic (PLAN2-FOUND#4) and D-015 ruling 4 (coarse full re-render → RC-2/T2).

**PO staging confirm (still needed):** On **a4**, heavy 6-panel layout, set `window.__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE = true`, reload, Play — if refetch/re-render **persists** (expected per harness), closes step-0 on live surface. If it **stops**, report back (would contradict harness; investigate host-TF-during-play or non-coarse panel mix).

**Pre-D-015 build compare:** Not available in this workspace. Code diff shows coarse routing unchanged; step-5 report (`T8-step5-unified-play-edge-park-advance-report.md`) preserved H-S17 fence GREEN with same `scheduleCoalescedSeek` coarse branch.

---

## 5. Invariants checked

| Invariant | Status |
|-----------|--------|
| I1–I2 (scope) | Satisfied — zero product diff |
| I8 | N/A — no edits |
| I14 | N/A — read-only |
| I15 | Harness A/B uses real `replayFrame` fan-out (H-S17) and production tick play (H-S59b-coarse); no proxy-green fix claims |

---

## 6. What I did NOT do / limits

- Did **not** reproduce PO’s exact **6-panel** layout (1m / 4H / 1H / 5m / 1D / 4H) on staging **a4** — harness uses 2v/2x2 with 1h coarse max.
- Did **not** capture live Network tab `/bars` counts per advance on staging (PO-only for refetch confirmation).
- Did **not** separate Y-axis `calculateScales` (RC-2) from X viewport follow visually — both look like “full redraw.”
- Harness **does not assert per-panel fetch count during coarse play** — fence gap (see §Fence gap).
- Step-5 **does** change independent / same-TF-miss / finer-self-owner cells (`ownMaster=true`); PO symptom scoped to **bigger-TF** panels — those cells are out of scope for this verdict.

---

## 7. Live-verification handoff

**Build:** PO reported **a4** (`window.__TALARIA_CHART_BUILD_ID` in iframe).

**Step-0 A/B on staging:**

1. Heavy mixed-TF multichart, sync OFF, enter replay, **Play** (tick mode).
2. Note Network: do 4H/1D panels show `/bars` or `/candles` on **each** host tick vs only on coarse bar close?
3. Console: `window.__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE = true` → **reload** → repeat Play.
4. **Expected (per harness + code):** behavior **unchanged** — still re-renders; refetch only if mirror miss (not introduced by step-5).

**RC-2 confirm:** Watch whether price scale refits every advance (TAL-01573) vs only candle strip updates.

---

## 8. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

Step-0 harness verdict: **pre-existing, not step-5 regression** for coarse same-pair path.

---

# Mechanism report (deliverable body)

## What fires on Play for a coarse panel

**Entry:** Host tick loop → `_multichartBroadcastReplayFrame` (`replay-system.js:6765+`) → iframe `applyReplayFrame` (`panel-cmd-bridge.js:694+`).

**Coarse same-pair branch (D-015 ON or OFF — identical routing):**

1. `scheduleCoalescedSeek(ch, ts, false)` (`panel-cmd-bridge.js:739` or `:830`)
2. rAF coalesce (`:1948–1982`); `ownMaster=false` → **mirror-first**:
   - `applyParentReplayMirror` (`:1066–1114`) when host sends `animatedCandle` + `tickProgress > 0`
   - else `applyStaticMirrorFrame` (`:1531–1594`)
   - else **`forceReplaySeek`** (`:2008–2066`) → `ensureReplayDataCoversTimestamp` → `goToReplayTimestamp`

**Render invalidation (every successful mirror/seek):**

- `applyMultichartMirrorFrame` → `chart.resampleData(sliced, currentTimeframe)` (`replay-system.js:6652`, `6717`) + `bumpDataVersion` + `_finishMultichartMirrorRender` (`:6724`)
- `goToReplayTimestamp` → `updateChartData` (`replay-system.js:5700`) → `chart.render()`
- Play follow: `maybePanelPlayViewportFollow` → `syncReplayViewportToPlayhead({ render: true })` (`panel-cmd-bridge.js:1774+`)

**Data refetch (conditional, not every advance):**

- `forceReplaySeek` → `ensureReplayDataCoversTimestamp` (`chart.js:6269+`)
- Multichart embed forces `replayRawTf = '1m'` (`chart.js:6341–6344`) when mirror path misses
- Mirror miss: `applyMultichartMirrorFrame` returns **false** when `ts > lastT` on panel `fullRawData` (`replay-system.js:6670–6672`) → catch-up / `scheduleMirrorCatchUp` (`panel-cmd-bridge.js:1121+`) → `/bars` fetch

---

## Refetch vs re-render (PO symptom split)

| Limb | Mechanism | User-visible | Step-5 introduced? |
|------|-----------|--------------|-------------------|
| **(b) Full re-render without refetch** | Mirror/resample + `render()` + optional Y `calculateScales` (RC-2) | Whole canvas flash, scale refit | **No** — BL-10/11 path pre-dates D-015; D-015 ruling 4 routed to TAL-01573 |
| **(a) Refetch each advance** | Only when mirror cannot cover host `ts` on loaded master, or `ensureReplayDataCoversTimestamp` inflight race | Network `/bars`/`/candles` spikes | **No** for coarse mirror-first path; pre-existing embed 1m cover policy |
| **Both** | Mirror miss → fetch → `goToReplayTimestamp` → full resample + render | Heavy stall + redraw | Pre-existing; worse on **very coarse** TFs (4H/1D) + short panel master window |

**Why single chart does not:** No iframe mirror/resample loop; host `updateChartWithAnimatedCandle` patches in-place on native master (`replay-system.js:5084+`).

---

## Fence gap — why H-S17/H-S19/H-S19b stay green while PO sees pain

| Scenario | Layout | TF mix | Play actuation | Asserts | Gap vs PO |
|----------|--------|--------|----------------|---------|-----------|
| **H-S17** | 2×2 same-pair | host 1m, B **1h** | `replayFrame` loop 180×1m | playhead advance; **renders ≤ 60**; **no fetch count** | 1h only; not 4H/1D/6-panel; synthetic frame loop not production `rs.play()` |
| **H-S19** | 2×2 | B/C **1h** coarse | play + drag cost | **render counter** coalesce (BL-12) | No refetch; idle/drag cells only |
| **H-S19b** | 2×2 | C **1h** coarse | eased follow smoothness | device-pixel render bounds | No network; no multi-coarse |
| **H-S8** | 4-panel | same TF 1m | accelerated play | **fetches == 0** | Same-TF only — does not exercise coarse mirror/resample |
| **H-S59b-coarse** | 2v | B **1h** | production tick play | replayTs monotonic only | **No fetch/render budget**; pending not gate |

**Root gap:** Fence proves **no per-1m-tick reslice storm** at 1h coarse (H-S17 renders=25≪180). It does **not** prove:

1. Zero `/bars` fetches during play on **4H/1D** panels
2. Bounded **full-canvas** renders per coarse bar close in **6-panel** CPU load
3. Production tick play with **animatedCandle** resample path (`replay-system.js:6587–6668`) at PO TF set

### Proposed fence extension (for Lane 4 / fix lane)

**H-S81 (proposed name): `mixed-coarse-play-fetch-render-budget`**

- Layout: 2×2 or 2×3 same-pair, sync OFF, host 1m
- Panels: **B=4h, C=1d** (or PO TF set), all enter paused replay
- Actuation: `startHostProductionTickPlay` (production tick, 15–20s) — same as H-S59b
- Assert per coarse panel:
  - `diag.fetches` delta **== 0** during play window (or ≤1 one-time hydration)
  - `diag.renders` delta **≤** `(playMs / panelTfMs) + SMALL` (coarse-bar cadence, not host tick count)
  - Optional: `totalDataFetches(apiLog) == 0` during play
- Kill-switch A/B: `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE` should **not** change counts (validates step-0 on gate)

---

## RC + recommendation

| Finding | Track | Registry |
|---------|-------|----------|
| Full re-render each advance (no network) | **RC-2 / T2** | **TAL-01573** (open) — `bumpDataVersion` + `calculateScales` + mirror resample |
| Refetch when mirror miss / short master | **T8 mirror-policy** (pre-existing) | Extend TAL-01563 family / new row if PO confirms network spikes |
| Step-5 regression on coarse panels | **Ruled out** | No new row; do **not** revert D-015 for this symptom |

**Fix recommendation (priority order):**

1. **Do not revert** `__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE` for coarse refetch — A/B shows no isolation.
2. **RC-2 path (T2):** Incremental mirror render — avoid full `resampleData` prefix + `calculateScales` when only last coarse bar animates (`replay-system.js:6644–6658` in-place patch path exists for `tp > 1` but coarse often hits full resample branch).
3. **T8 adjunct (if PO confirms refetch):** On play, when panel `fullRawData` already covers host `ts` at **panel TF granularity**, skip `ensureReplayDataCoversTimestamp` 1m embed fetch (`chart.js:6341–6344`); refetch only on genuine miss (reuse loaded bars).
4. **Fence:** Add **H-S81** before any fix ships; keep H-S17/H-S19 family as reslice-storm floor.

**Handoff:** Manager → **T2** for RC-2 re-render (TAL-01573); **T8** only if PO live-confirm shows per-tick `/bars` on 4H/1D (mirror-miss refetch), with H-S81 RED-first.
