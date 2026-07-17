# T3 — Multichart order parity harness spec (honest RED discriminators)

**Authority:** D-023 (named switch-OFF RED per fix from birth) + I15 (real actuation, honest end-state).  
**Purpose:** Define acceptance scenarios for multichart-order parity **before** any fix lands — so Lane 3/4 can register rows and fixes cannot ship without a provable discriminator.  
**Scope:** Spec/doc only. **No** `scenarios.mjs`, `react-parity-lib.mjs`, or product edits in this deliverable.

**Diagnostic inputs (read before implementing):**

| Doc | Covers |
|-----|--------|
| `worker-reports/ORD-MULTICHART-PARITY-diagnostic-report.md` | Panel-B lockout + dual-replay PnL stall |
| `worker-reports/ORD-DUP-DURATION-diagnostic-report.md` | Trades duplication + wrong Duration on F5 |
| `A6-4-HOST-CANONICAL-ORDER-STORE-DESIGN.md` | Target architecture + interim switches (INT-1..8) |

---

## 0. Harness surfaces

| Surface | Runner | When to use |
|---------|--------|-------------|
| **Built React multichart** (primary — I15) | `react-run.mjs` + `react-parity-scenarios.mjs` | LOCK, PNL, DUP, DUR — anything involving parent `#orderPanel`, Execute rail, trades table DOM |
| **Host engine harness** (secondary — store-only sub-probes) | `run.mjs` + `scenarios.mjs` | Engine dedupe invariants without React DOM (optional companions below) |

**Pre-boot L1 (all React rows):**

- `boot.buildIds.ok` — same `BUILD_ID` on host + panel B iframe
- `boot.boundary.ok` — panel B is iframe embed, not parent chart
- Layout: `mcLayout=2v`, **`pair=independent`** (host file25 / panel B file27 — different tickers)
- Replay: entered paused on host **and** panel B (`replaySystem.isActive === true` on both before order actuation)

**Registration IDs (Lane 4 when implementing):**

| Spec ID | Proposed `react-parity-scenarios` id | Proposed CLI hook (switch-OFF) |
|---------|--------------------------------------|--------------------------------|
| **ORD-MC-LOCK** | `H-ORD-MC-LOCK` | `--ord-mc-place-replay-sync-off` |
| **ORD-MC-PNL** | `H-ORD-MC-PNL` | `--ord-mc-tick-pnl-proxy-off` |
| **ORD-MC-DUP** | `H-ORD-MC-DUP` | `--ord-mc-restore-dedupe-off` |
| **ORD-MC-DUR** | `H-ORD-MC-DUR` | `--ord-mc-duration-norm-off` |

Companion host-only rows (optional, not bless-path):

| Spec ref | Proposed `scenarios.mjs` id | Purpose |
|----------|----------------------------|---------|
| ORD-MC-DUP §3.2 | `H-ORD-ENG-DEDUPE-1` | `restore` + `addOrder` dedupe without React reload |
| ORD-MC-DUR §4.2 | `H-ORD-ENG-DUR-1` | Duration math via `page.evaluate` on row builder (no trades DOM) |

---

## 1. ORD-MC-LOCK — panel B can open a new order after orders on both panels

### 1.1 Symptom / discriminator

**User-visible failure:** After placing an order on host A and panel B (different tickers), focus B and click **Execute** → no new open/pending order on B (silent no-op or toast only in console).

**Discriminator switch (primary):** `__TALARIA_DISABLE_ORDER_MC_PLACE_REPLAY_SYNC_V1`  
(unset = fix ON — parent ensures iframe replay active before `runCommand('placeOrder')`)

**Secondary switch (guard stuck — separate fix, separate A/B if shipped):** `__TALARIA_DISABLE_ORDER_GUARD_STUCK_RESET_V1`

### 1.2 Setup

| Step | Detail |
|------|--------|
| Layout | 2v multichart, **independent pair** (A = file25, B = file27) |
| Replay | Enter paused on all panels; wait until panel B iframe reports `chart.replaySystem.isActive === true` |
| Orders | Place **one filled or pending order on A**, then **one on B** (market/limit with SL/TP as harness default) |
| Focus | Real click panel B canvas chrome (not `focusPanelById` alone) |

### 1.3 Actuation (I15 — real)

| Step | Mechanism | Notes |
|------|-----------|-------|
| 1 | `focusReactPanel(page, 'B')` | Real mouse at iframe-translated coords |
| 2 | Set parent `#orderPanel` fields via DOM (side, qty, SL/TP) — same values single-chart uses | Do **not** call `runCommand('placeOrder')` directly — must exercise **Execute intercept** |
| 3 | **Real click** `#placeOrderButton` on parent document | Routes through `MultichartGrid` capture handler → iframe `placeOrder` |
| 4 | Repeat ×3 with focus swaps A↔B between attempts | Catches intermittent replay-enter race |

**Invalid actuation:** `page.evaluate(() => grid.runCommand('placeOrder', …))` without Execute click; synthetic `eventBus.emit` placement.

### 1.4 End-state probe (honest — not proxy)

| Assertion | Probe | GREEN |
|-----------|-------|-------|
| **B store mutated** | Read iframe B: `chart.orderManager.openPositions.length + pendingOrders.length` before/after | **Increases by 1** on successful Execute |
| **Host not double-counting** | Host `openPositions.map(p => p.id)` unique; length matches expected panel count | No duplicate id from mirror echo |
| **No replay gate throw** | Parent console buffer (or bridge return): must **not** contain `iframe replay not active` on GREEN runs | Silent fail = RED |
| **Optional UX** | Execute button not permanently disabled | Not stuck `disabled` after success |

**Invalid proxies:** Execute click dispatched (`ok: true`) without store check; host-only count when order was meant for B iframe.

### 1.5 Switch-OFF RED (D-023)

With `__TALARIA_DISABLE_ORDER_MC_PLACE_REPLAY_SYNC_V1 = true` (harness `--ord-mc-place-replay-sync-off`):

- **Expected RED:** ≥1/10 runs where step 3 after focus B **does not** increase B store (or throws replay gate) — reproduces today's lockout class.
- **Must not be vacuous:** switch-OFF must change outcome vs ON on the **same** actuation path (not a no-op toggle).

### 1.6 Single-chart parity oracle

| Step | Surface |
|------|---------|
| Open **single-chart** harness or built main chart (no multichart) |
| Same replay-enter → set `#orderPanel` → click Execute ×3 | Each success increments `window.chart.orderManager` open+pending count |
| **Pass bar:** 3/3 success on single chart; multichart row RED when B store fails |

Document delta explicitly: multichart adds iframe replay gate + focus routing; single chart has neither.

### 1.7 File ownership

| Piece | Owner |
|-------|-------|
| `H-ORD-MC-LOCK` scenario body | **Lane 4** (`react-parity-scenarios.mjs`) |
| Helpers: `clickParentExecute`, `readPanelOrderCounts`, `readParentOrderPanelFields`, replay-active probe | **Lane 4** (`react-parity-lib.mjs` — **hand off hooks list below**) |
| Fix: replay sync + Execute gate | **Lane 3** (`MultichartGrid.jsx`, `panel-cmd-bridge.js`) — post-remigration for Grid touches |
| Guard watchdog (if split) | **Lane 3** (`order-interaction-guard.mjs`, `order-manager.js`) |

**Lane 4 hook requests (do not implement in this spec task):**

- `waitForPanelReplayActive(page, panelId, budgetMs)`
- `clickParentExecute(page)` → real `#placeOrderButton` click
- `readOrderStoreCounts(page, panelId)` → `{ open, pending, ids[] }` host or iframe frame
- `installConsoleCapture(page)` for parent + iframe filter strings

---

## 2. ORD-MC-PNL — dual replay updates panel B PnL tick-for-tick

### 2.1 Symptom / discriminator

**User-visible failure:** Positions open on **both** panels; replay **Play** on both; **bottom trades rail** (and/or host HUD) shows **frozen** unrealized PnL for panel B's ticker while replay advances.

**Discriminator switch (interim):** `__TALARIA_DISABLE_ORDER_MC_TICK_PNL_PROXY_V1`  
(unset = ON — iframe replay tick notifies host to recompute background marks / rail)

**Long-term (A6-4):** `__TALARIA_DISABLE_ORDER_MC_PNL_HUB_V1` — same row, stricter hub semantics.

### 2.2 Setup

| Step | Detail |
|------|--------|
| Layout | 2v **independent** (different tickers) |
| Positions | One **open** market order on A (file25), one on B (file27) — harness seed or real Execute |
| Replay | **Play** on host (shared wall-clock); confirm panel B iframe `replaySystem.isPlaying` |
| Duration | Sample ≥10 replay ticks (~5–15s wall time at harness tick speed) |

### 2.3 Actuation (I15 — real)

| Step | Mechanism |
|------|-----------|
| Enter replay, place orders via Execute path (§1) or controlled harness seed that still runs real `registerOpenOrder` on each panel |
| Real click **Play** on parent replay control (not `replaySystem.play()` only in evaluate — must hit UI control at least once per run) |
| Wait for replay ticks via production path (`panel-cmd-bridge` `replayTick` fan-out) |

**Optional stress (not required for RED):** host paused, B playing — interim proxy should still update B ticker on host store when switch ON.

### 2.4 End-state probe (honest)

| Assertion | Probe | GREEN |
|-----------|-------|-------|
| **B ticker PnL moves** | Host `buildLiveTradeRowsFromOrderManager` equivalent: find row matching B's ticker; sample `unrealizedPnL` (or parsed DOM `$`) at t0 and t1 | **Value changes** across ticks while replay advances |
| **A ticker PnL moves** | Same for A | Changes (control — replay alive) |
| **Replay advanced** | Host + B `replayTimestamp` strictly increased between samples | Non-vacuous |
| **Not poll-only** | Reject GREEN if only `omTradeRev` counter incremented but PnL numeric unchanged | Catches 800ms empty re-render |

**DOM path (preferred for PO parity):** parse trades table unrealized column for **both** tickers from React `#trades` / open-positions table — must match store within rounding.

**Invalid proxies:** `order:update-tick` event count; table re-render without numeric change; iframe-local PnL only (host rail can still be RED).

### 2.5 Switch-OFF RED

With `__TALARIA_DISABLE_ORDER_MC_TICK_PNL_PROXY_V1 = true`:

- **Expected RED:** B-ticker row PnL **flat** across ≥10 ticks while replay timestamps advance (today's host-only subscriber gap).
- A-ticker may still move — discriminates cross-panel aggregation, not dead replay.

### 2.6 Single-chart parity oracle

| Step | Expected |
|------|----------|
| Single chart, one open position, Play | Trades rail PnL updates tick-for-tick |
| **Pass bar:** single-chart GREEN; multichart RED on B row when switch OFF |

### 2.7 File ownership

| Piece | Owner |
|-------|-------|
| `H-ORD-MC-PNL` scenario | **Lane 4** |
| Helpers: `sampleTradesRailPnL(page, ticker)`, `startReplayPlayUI`, tick sampler | **Lane 4** (`react-parity-lib.mjs`) |
| Interim tick proxy / hub | **Lane 3** (`panel-cmd-bridge.js`, `MultichartGrid.jsx`, narrow `order-manager.js` hook) |
| Full A6-4 PnL hub | **Lane 3** (post-remigration bundle) |

---

## 3. ORD-MC-DUP — refresh does not duplicate trades rows

### 3.1 Symptom / discriminator

**User-visible failure:** Multichart with N distinct open orders → **F5 reload** → trades tab shows **>N rows** or duplicate ids (PO: tab **4**, list **8–10**).

**Discriminator switch (one-knob interim):** `__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1`  
(unset = ON — bundles: open id dedupe, restore rebuilds `orders[]`, `addOrder` checks `openPositions`)

Granular children (if split): `__TALARIA_DISABLE_ORDER_OPEN_DEDUPE_V1`, `__TALARIA_DISABLE_ORDER_RESTORE_REBUILD_ORDERS_V1`, `__TALARIA_DISABLE_MC_HOST_ORDER_MIRROR_V1`

### 3.2 Setup

| Step | Detail |
|------|--------|
| Layout | 2v **independent**, 2 tickers |
| Orders | Place **one distinct order per panel** (2 total) via Execute path |
| Reload | **`page.reload({ waitUntil: 'networkidle0' })`** — real F5 equivalent |
| Wait | Multichart ready + host bootstrap restore complete |

### 3.3 Actuation (I15 — real)

| Step | Mechanism |
|------|-----------|
| Place order on A (Execute, focus A) | Real clicks |
| Place order on B (Execute, focus B) | Real clicks |
| Record pre-reload: `openPositions.length`, id set, trades tab badge count, visible table rows |
| **Full page reload** | Not sessionStorage inject alone |

### 3.4 End-state probe (honest)

| Assertion | Probe | GREEN |
|-----------|-------|-------|
| **Store count** | Host `window.chart.orderManager.openPositions.length` | **=== 2** |
| **Unique ids** | `new Set(openPositions.map(p => p.id)).size === 2` | No duplicates |
| **Tab vs rows** | React open-positions tab badge **===** visible `<tr>` count **===** store count | Closes PO 4 vs 8–10 mismatch |
| **sessionStorage** | Optional diagnostic log: `open_positions` ids length in blob | ≤2 unique (informational) |

**Invalid proxies:** Store count correct but DOM duplicated (still RED); store wrong but DOM looks fine (RED).

### 3.5 Switch-OFF RED

With dedupe master OFF:

- **Expected RED:** post-reload `openPositions.length >= 3` **or** duplicate ids **or** tab count ≠ row count.
- Bisect: `__TALARIA_DISABLE_ORDER_PERSISTENCE_V1 = true` → refresh column should not restore dupes (diagnostic only — not the production discriminator).

### 3.6 Single-chart parity oracle

| Step | Expected |
|------|----------|
| Single chart, 1 order, F5 | `openPositions.length === 1`; tab === rows === 1 |
| Multichart 2 orders, F5 | Same invariant with N=2 |

If single-chart F5 clean but multichart dup → confirms multichart mirror path (diagnostic prediction).

### 3.7 Companion: engine-only sub-probe (host harness)

**`H-ORD-ENG-DEDUPE-1`** (optional, Lane 4 in `scenarios.mjs`):

- Simulate restore: `openPositions=[{id:1}], orders=[]` then `addOrder({id:1})` via bridge evaluate.
- **GREEN (switch ON):** skipped / length stays 1.
- **RED (switch OFF):** length 2.

Does not replace `H-ORD-MC-DUP` for bless — F5 + React DOM required for acceptance.

### 3.8 File ownership

| Piece | Owner |
|-------|-------|
| `H-ORD-MC-DUP` | **Lane 4** (react) |
| `H-ORD-ENG-DEDUPE-1` | **Lane 4** (host) |
| Dedupe fix | **Lane 3** (`order-service.js`, `order-manager.js`, `panel-cmd-bridge.js`, optional `MultichartGrid.jsx` mirror skip) |

---

## 4. ORD-MC-DUR — duration column matches replay clock (single-chart behavior)

### 4.1 Symptom / discriminator

**User-visible failure:** Open positions show **absurd Duration** (e.g. 5138h) or **inconsistent** durations for rows with same TIME column after multichart F5.

**Discriminator switch:** `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1`  
(unset = ON — `normalizeEpochMs` + aligned `rowNowMs` clock in `orderManagerTradeRows.js`)

### 4.2 Setup

| Step | Detail |
|------|--------|
| Layout | Prefer **single-chart** baseline run first; multichart row uses 2v independent **after** dedupe GREEN |
| Replay | Active, paused or playing with known `replayTimestamp` |
| Order | One open position with **`openTime` set from replay bar ms** at fill (not harness `Date.now()` injection) |

### 4.3 Actuation (I15 — real)

| Step | Mechanism |
|------|-----------|
| Place one order via Execute (real click) at known replay ts |
| Advance replay **≥5 minutes** of bar time via step-forward or short Play |
| Read trades table **Duration** cell for that order id |

### 4.4 End-state probe (honest)

| Assertion | Probe | GREEN |
|-----------|-------|-------|
| **Duration sane** | Parse displayed duration to minutes; compare to `(rowNowMs - normalizeEpochMs(openTime))` | Within **±2 minutes** slack |
| **No hour-scale outlier** | Duration `< 48h` for replay session scoped test | Fails 5138h class |
| **Clock source** | `rowNowMs` from host `replaySystem.replayTimestamp` when active | Document in failure log |
| **Dup coupling** | If ORD-MC-DUP RED, skip duration strict pass (duplicate rows invalidates duration row) | Run order: DUP first |

**Invalid proxies:** Raw `openTime` in evaluate without DOM duration; checking TIME column only.

### 4.5 Switch-OFF RED

With normalization OFF:

- Fixture or live row with **seconds-unit `openTime`** → duration thousands of hours **OR**
- `openTime` fallback to `Date.now()` while `rowNowMs` is replay → wide delta.

Must reproduce **observable wrong Duration in table**, not silent evaluate-only failure.

### 4.6 Single-chart parity oracle

| Step | Expected |
|------|----------|
| Same order + replay advance on **main chart only** | Duration matches formula within slack |
| Multichart | **Same formula** per host store row — parity means identical math, not identical DOM layout |

### 4.7 File ownership

| Piece | Owner |
|-------|-------|
| `H-ORD-MC-DUR` | **Lane 4** (react — reads DOM duration) |
| `H-ORD-ENG-DUR-1` | **Lane 4** (host — calls row builder in evaluate) |
| Fix | **Lane 3** (`orderManagerTradeRows.js` in `talaria-design` bundle) |

---

## 5. Cross-row dependencies and run order

```text
ORD-MC-DUP (store truth)
    → ORD-MC-DUR (duration meaningless if dup rows)
ORD-MC-LOCK (independent — can run parallel)
ORD-MC-PNL (needs valid open positions — run after LOCK GREEN or harness seed)
```

**Suggested verify bundle (post-fix, Lane 4):**

```bash
cd "chart v 1.4/chart/multichart-prod/harness"
node react-run.mjs --runs=10 --only=H-ORD-MC-LOCK,H-ORD-MC-PNL,H-ORD-MC-DUP,H-ORD-MC-DUR
```

Each fix ships with **isolated** `--only=<row>` 10/10 ON and named switch-OFF 10/10 RED before joining bundle.

---

## 6. `react-parity-lib.mjs` hook handoff (Lane 4 — do not edit in spec task)

| Helper | Used by | Description |
|--------|---------|-------------|
| `waitForPanelReplayActive(page, panelId)` | LOCK | Poll iframe until `replaySystem.isActive` |
| `clickParentExecute(page)` | LOCK, DUP, DUR | Real `#placeOrderButton` click |
| `fillParentOrderPanel(page, spec)` | LOCK, PNL, DUP | Set type/qty/SL/TP on `#orderPanel` |
| `readOrderStoreCounts(page, panelId)` | LOCK, DUP | `{ open, pending, ids }` |
| `readTradesOpenRows(page)` | DUP, DUR, PNL | `{ tabCount, rowCount, rows: [{ ticker, pnl, duration, id }] }` |
| `sampleTradesRailPnL(page, ticker, sampleMs, minSamples)` | PNL | Returns monotonicity / delta |
| `reloadMultichart(page)` | DUP | F5 + wait `waitForReactMultichartReady` |
| CLI flags | All | Map 1:1 to switches in §0 table |

Host harness **does not** need these hooks for primary acceptance rows.

---

## 7. Manager routing — which lane implements what

| Deliverable | Lane | Notes |
|-------------|------|-------|
| **This spec** | **Lane 2** | Done — `T3-MULTICHART-ORDER-PARITY-HARNESS-SPEC.md` |
| **`H-ORD-MC-*` scenarios + react hooks** | **Lane 4** | Register in `react-parity-scenarios.mjs`, `known-failing.json` when RED first; extend `react-run.mjs` flags |
| **`H-ORD-ENG-*` companions** | **Lane 4** | Optional engine sub-probes in `scenarios.mjs` |
| **INT dedupe + duration norm** | **Lane 3** | Freeze-safe — `order-service.js`, `order-manager.js`, `orderManagerTradeRows.js` |
| **Lockout replay sync + guard** | **Lane 3** | `MultichartGrid.jsx` + `panel-cmd-bridge.js` — coordinate remigration window |
| **PnL tick proxy / hub** | **Lane 3** | `panel-cmd-bridge.js` + narrow host hook |
| **A6-4 host-canonical store** | **Lane 3** (post-remigration) | Supersedes interim switches per `A6-4-HOST-CANONICAL-ORDER-STORE-DESIGN.md` §3 |
| **PO live confirm** | **PO** | After harness 10/10 ON + switch-OFF RED — same build id as combined bless |

**Acceptance rule (D-023):** No fix closes ORD-MC-* until its row is **10/10 PASS** with fix ON and **10/10 FAIL** with the named switch OFF on the **same actuation path**. Vacuous A/B (maxStep=0 style) is not acceptable — document in Lane 4 report.

**Quarantine note (D-027):** These four rows are **bless-path discriminators** once registered — they must **never** be quarantined while a multichart-order fix is seeking bless.

---

## 8. References

- `T3-VERIFY-ONLY-PASS-SPEC.md` — template for actuation/end-state tables
- `T4-A6-ORDER-INTERACTION-CONTRACT.md` — A6-4 contract row
- `RESOLUTION-TRACKER.csv` — A6-4 deferred; interim INT rows
- Existing order harness: `H-S36` (fill anchor only — same-pair, not multichart parity)

---

*Spec author: Lane 2 (`ORD-MULTICHART-harness-scenarios-lane2`). No product or harness code in this commit.*
