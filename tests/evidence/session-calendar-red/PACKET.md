# Packet — session-calendar-red (RED half)

| | |
|---|---|
| **Manager** | A (Critical Path) |
| **Row** | Session-calendar bucketing (canary blocker) |
| **Packet** | session-calendar-red |
| **Tier** | 3 |
| **Branch / worktree** | `manager-a/session-calendar-red` @ `C:\Users\user\Desktop\talaria1\manager-a-session-calendar` |
| **Base** | `manager-a/critical-path` @ `634448817` |
| **Finding** | `docs/plan3/FINDING-SESSION-CALENDAR-20260727.md` |
| **Rulings applied** | §A5 (test integrity), §A7 (differential oracle), §A4b (multichart cell), §A4c (kill-switch / correctness class) |
| **Scope** | RED oracle + shared helper only. **The product resample paths are NOT wired.** Wiring awaits Manager A authorisation. |
| **Revision** | **r2** — reworked after rejection 1 of 2 (independent adversarial review). See §0. |

---

## 0. What changed in r2, and why

Rejection 1 was correct and the defect was serious: **the GREEN half certified a patch that did nothing to the product.** `_sessionCalendarSymbol()` read `this.sessionCalendarSymbol || this.currentPair || this.symbol || this.pair`, and **all four properties have zero assignments in `chart.js`.** The oracle passed only because `makeHarness` set the first of them itself — a property of the harness's own invention. Against a real product chart the wiring resolved an empty symbol, fell through to `epochAlignedBucketStart`, and produced byte-identical pre-fix output.

The RED half was not rebuilt; it was extended. Every original cell survives. The seven required changes:

| # | Required | Done |
|---|---|---|
| 1 | Fix the symbol read; investigate whether `currentSymbol` is sufficient | **Investigated — it is NOT sufficient on its own.** Identity now comes from the product's own instrument registry. §3.1 |
| 2 | Cell asserting the wired product resolves a non-empty class from a product-set property | **Cell N**, 54 assertions, 40 failing in `broken`. §4.1 |
| 3 | Make the `productIsWired()` transition real | `_sessionBucketStart` + `_sessionInstrumentClass` added to `LIFTED_METHODS` (lifted when present); cell 0's defect-formula assert is now stated against `productIsWired()` and inverts with it. |
| 4 | `W5` incomplete — strengthen or drop | **Strengthened to a running maximum**, and G2 extended with staircase and deep-staircase cases. §8.1 |
| 5 | Crypto weekly unguarded | **Pinned on both sides** — pre-fix and post-fix digests, plus the open weekday. Ratification still owed. §9.6 |
| 6 | Mirror gap — the wiring is a four-file change | **Cell M3**, 18 assertions over all four files. §7 |
| 7 | Correct the headline count | **262 value assertions + 12 informational rows = 274.** §5 |

Both "record rather than fix" items are recorded: the brace matcher's regex-literal blind spot (§6) and the unreachable DST branches (§3.3).

---

## 1. What shipped

| File | Role |
|---|---|
| `chart v 1.4/chart/modules/session-calendar.js` | The shared session-calendar helper. Pure functions, no DOM, browser + Node. |
| `homepage/public/chart/modules/session-calendar.js` | Generated mirror, byte-identical (asserted by cell M). |
| `chart v 1.4/chart/modules/session-calendar.contract.json` | Machine-readable §A4c module contract, as a **sidecar**. See §7. |
| `chart v 1.4/chart/modules/m22-session-calendar-harness.mjs` | Real-product harness + deterministic fixtures + the proposed wiring diff. |
| `chart v 1.4/chart/modules/m22-session-calendar-bucketing.red.test.mjs` | The RED oracle. **23 cells, 262 value assertions + 12 informational rows.** |
| `chart v 1.4/chart/modules/m22-session-calendar-fourstate.mjs` | §A5 driver: four-state proof × 3 repeats × 8 clock configurations = 40 runs. |

No product file was modified. `npm run preflight:module-contracts` still exits 0.

## 2. Label convention, as encoded

**`stamp-at-open` + session-date naming.** Recorded in three places that are cross-checked against each other by cell M: `SessionCalendar.LABEL_CONVENTION`, `session-calendar.contract.json → labelConvention`, and cell A's assertions.

- The bar's `t` **is the session open instant.** For FX that is 17:00 `America/New_York`, DST-aware.
- The **name** is a separate function, `sessionLabel(t, tf, opts)`, returning the session *date*: the open's local date **plus `labelOffsetDays`** (FX: 1, crypto: 0).
- Therefore, asserted as values in cell A:
  - a bucket opening **Sunday 17:00 ET** is named **`2013-01-07` / Mon**;
  - a bucket opening **Thursday 17:00 ET** is named **`2013-01-04` / Fri**.
- Consequence the display layer must honour: Friday's daily bar renders its open stamp as `Thu 03 01 '13 17:00` while being **named Fri 4 Jan**. The oracle asserts both halves (cell B `friday-bucket-screen-stamp`, `friday-bucket-label`).

## 3.1 Instrument identity — what `currentSymbol` holds, and why it is not enough

**Direct answer: `currentSymbol` is the only symbol property `chart.js` sets (13 assignment sites), but it holds a *display label*, not an instrument identifier. Correcting the property name alone would have fixed roughly one third of real FX datasets and silently left the rest broken.**

### What it actually contains at resample time

Enumerated from all 13 assignment sites:

| Value | Where it comes from | Six-char heuristic verdict |
|---|---|---|
| `null` | initial value (`chart.js:1133`), before any load | `unknown` |
| `EURUSD` | `resolveSessionTickerForFileId`, or CSV-detected symbol (`chart.js:17964`) | ✅ `fx` |
| `EUR/USD` | `finalize()` → `_formatPairTicker` returns the slashed form (`chart.js:1977`) | ✅ `fx` |
| `EURUSD_2013_1M` | `session.fileName` stem, uppercased (`chart.js:2548`) | ❌ `unknown` |
| `EURUSD_FULL_1MIN_1MIN` | FirstRate FX bundle name | ❌ `unknown` |
| `20251028_194229_GBPUSD` | Dukascopy upload name | ❌ `unknown` |
| `ES_week_1min_1min` | FirstRate futures bundle | ❌ `unknown` |
| `AAPL_full_1min_adj_split` | FirstRate stock bundle | ❌ `unknown` |
| `NQ` | `_displaySessionFuturesSymbol` root form | ✅ `cme-index-futures` |
| `FILE_1234` | pair switch with no resolvable name (`chart.js:2558`, `:5505`, `:10123`, `:10515`) | ❌ `unknown` |
| `CHART` | `extractSymbolFromFilename` "untitled" branch (`chart.js:19807`) | ❌ `unknown` |
| `EURUSD1` | `extractSymbolFromFilename` short-name branch (`chart.js:19812`) | ❌ `unknown` |

`resolveInstrumentClass` requires exactly six alphanumerics to call something FX, so **the three most common real FX shapes — FirstRate, Dukascopy and filename-stem — all resolved to `unknown` and fell back to epoch alignment.** Manager A's suspicion was right, and this is the measured extent of it.

### Where identity comes from instead

Not a longer fallback chain. **`chart v 1.4/chart/modules/market-calculations.js` already owns symbol → instrument-type resolution**, and owns it for exactly these shapes: `MarketCalculationEngine._resolveRegistryKey` splits compound filenames, tries segments longest-first, joins adjacent segments and consults a crypto-base alias table, because misclassifying `ES_week_1min_1min` as forex gives wrong pip size and wrong P&L. It is a maintained, 120-instrument registry, and it is **already loaded on all four servable shells** (`dist-v9/index.html` and `multichart-prod/chart-embed.html`, in both trees) — so consuming it adds no script tag and no new deployment surface.

The wiring therefore reads:

```js
_sessionInstrumentClass() {
    // memoised per symbol
    return SessionCalendar.classFromRegistry(window.marketCalcEngine, this.currentSymbol);
}
```

**The confidence gate is `isRegistered()`, not `detectMarketType()`.** This distinction is the whole design. `detectMarketType` deliberately returns `'forex'` for anything it cannot place — correct for position sizing, catastrophic here, because it would apply a 17:00 New York session to a `FILE_1234` dataset that may well be NQ. `isRegistered()` demands an explicit registry row, and it draws the line in exactly the right place:

| Shape | `isRegistered` | resolved class |
|---|---|---|
| `EURUSD`, `EUR/USD`, `EURUSD_2013_1M`, `EURUSD_FULL_1MIN_1MIN`, `20251028_194229_GBPUSD` | ✅ | `fx` |
| `BTCUSD`, `BTC_full_1min` | ✅ | `crypto` |
| `NQ`, `ES_week_1min_1min` | ✅ | `cme-index-futures` (declared → epoch) |
| `AAPL_full_1min_adj_split` | ✅ | `us-equities` (declared → epoch) |
| `FILE_123`, `CHART`, `EURUSD1`, `null` | ❌ | **`null` — unresolved** |

### What happens when identity is unresolved

**Today's grid is kept, and the degradation is announced.** `__talariaMarkMissingModule('SessionCalendar.unresolved-instrument')` fires, which flows into `__TALARIA_DEGRADED_STATE.degradedModules` and the support passport per §A4c.5. A chart showing epoch-aligned daily bars because it could not name its instrument **is** a degraded chart, and the ticket should say so. The announcement is suppressed for intraday timeframes, where nothing is lost (cell N `unidentifiable-does-not-cry-wolf-on-intraday`).

This is a real, stated limitation rather than a hidden one: **a user who loads a CSV that produces `FILE_1234` or `EURUSD1` keeps the phantom Saturday.** It is the conservative failure direction — no displayed value moves without positive instrument identification — but Manager A should know the canary cohort's datasets need to resolve. EURUSD, the canary instrument, resolves in every shape tested.

Two consequences worth flagging:

- **A new declared class, `us-equities`**, because `getSpecs().type === 'stocks'` is genuinely reachable (AAPL bundles) and the market-type map needs a real destination for it. Declared status means epoch fallback, so no equities output moves. This is not a class synthesised for coverage — it is one the product can already produce.
- **`SessionCalendar` now depends on `MarketCalculationEngine`** for the product path. Declared in the contract's `dependsOn`, with load ordering (`after: market-calculations.js`). If the registry is absent the resolver returns `null` and the chart degrades loudly rather than throwing (cell N, three assertions).

`resolveInstrumentClass`, the old string heuristic, is retained for the Node/test API and for callers holding a clean ticker, but **it is no longer the product's source of truth.**

## 3. Helper API surface

Published as `window.SessionCalendar` (and `module.exports`). Version `20260728b82`.

| Member | Contract |
|---|---|
| `bucketStart(tMs, tf, {timeframeMs, symbol?, instrumentClass?})` | **THE shared boundary.** Both resample paths must call exactly this. `timeframeMs` is supplied by the caller's own `parseTimeframe`, so the fallback answer can never drift from the caller's grid. Returns the bucket open instant. |
| `epochAlignedBucketStart(tMs, tfMs)` | The legacy formula, kept **inside** the helper so the kill-switch path is the same code and there is still only one implementation. |
| `sessionLabel(openMs, tf, opts)` | `{key, weekday, zone, convention, openLocalMinuteOfDay, openLocalWeekday}` — the naming convention. |
| `openLocalTime(openMs, opts)` | `{hour, minute, minuteOfDay, weekday, offsetMinutes}` — the DST assertion surface. |
| `classifyTimeframe(tf)` | `{handled, unit, count, reason}`. `1d`/`1w`/`1wk` handled; `Nmo` explicitly **not** handled (`calendar-month-branch-owns-this`); sub-daily **not** handled (`sub-daily-epoch-aligned-is-correct`). |
| `resolveInstrumentClass(symbol, opts)` | String-shape heuristic. `fx` \| `crypto` \| `cme-index-futures` \| `us-equities` \| `unknown`. **Not the product path** — see §3.1. |
| `classFromMarketType(type)` | `forex→fx`, `crypto→crypto`, `futures→cme-index-futures`, `stocks→us-equities`, else `null`. Total over what the product registry returns. |
| `classFromRegistry(engine, symbol)` | **The product path.** Instrument class via `MarketCalculationEngine`, gated on `isRegistered()`. Returns `null` for unresolved identity rather than guessing. |
| `instrumentClasses()` / `describeClass(id)` | The extensible registry. |
| `explain(tMs, tf, opts)` | Diagnostic actual-vs-expected view used by the oracle. |
| `isEnabled()` | Kill-switch state. |
| `resetCaches()` / `stats()` | Boundary-cache, registry-lookup and DST-branch instrumentation (cells K, K2). |

**Instrument classes.** `fx` (17:00 America/New_York, week opens Sunday 17:00, DST-aware) and `crypto` (00:00 UTC, week opens Monday 00:00 UTC) are **implemented**. `cme-index-futures` and `us-equities` are **declared, not implemented** — each names the calendar inputs it still needs (CME: holiday calendar, daily maintenance break, early-close table; NYSE: holiday calendar, half-day table, and an RTH-vs-ETH decision) and falls back to legacy epoch alignment, so declaring them changes nothing today. `unknown` is the safe default for anything unclassifiable: never guess a session.

### 3.3 DST — including the two branches that are *not* tested

**DST is not a constant offset.** Every boundary is resolved as a local wall-clock hour through the IANA zone database (`Intl.DateTimeFormat` + a two-pass wall→UTC inversion). Cell A2 asserts the same 17:00 anchor maps to offset −300 in January and −240 in June, so a fixed millisecond subtraction cannot reproduce it. Cells D1/D2 assert the structural consequence: exactly one 23h session at spring-forward and exactly one 25h session at fall-back.

**Recorded, per Manager A: `wallToUtc` has two branches that no fixture reaches.** They are unreachable for both implemented classes — FX anchors at 17:00 `America/New_York` and crypto at 00:00 UTC, while US transitions happen at 02:00 local and UTC has none. Rather than synthesise an instrument class that does not ship in order to manufacture coverage, each is now an **explicit documented policy plus a counter**:

| Branch | Policy (now stated in source, previously emergent) | Diagnostic |
|---|---|---|
| **Gap** (spring-forward; e.g. 02:30 local never occurs) | Return the first instant **after** the gap. This **moves the local anchor for that one session**, which breaks the constant-anchor invariant cells D1–D3 assert. An anchor inside a gap is unrepresentable, so no return value is correct — the counter, not the value, is the contract. | `stats.wallClockGapAdjustments` |
| **Ambiguity** (fall-back; e.g. 01:30 local occurs twice) | Take the **earlier** occurrence, i.e. the pre-transition offset. Chosen so the session opens as early as possible and no bar between the two occurrences is orphaned ahead of its own open. Previously this was whatever the two-pass happened to converge on; it is now a decision. | `stats.wallClockTransitionCrossings` |

Cell K2 asserts both counters read **zero** across every fixture the packet uses, including both 2013 transitions, and that both policies are documented in the source. Cell K asserts the same for the hot-path fixture. A non-zero count means an added class has entered an untested branch and must re-prove the anchor invariant before shipping.

**Kill-switch: `__TALARIA_DISABLE_SESSION_CALENDAR_V1`** (correctness class, §A4c). Absent → session calendar active. Truthy → every call returns `Math.floor(t / timeframeMs) * timeframeMs`.

## 4. RED proof — what fails today, with values

`M22_SC_STATE=broken` (real product as committed): **84 of 260 value assertions fail.** 11 of 23 cells fail; the 12 differential "must not change" cells pass. Full record: `m22-session-calendar-broken.json`.

| Cell | Failing | Subject |
|---|---|---|
| **N** | **40 / 54** | **Product wiring resolves a real instrument class and moves real output** |
| B | 11 / 11 | PO-confirmed 2013-01-04/05 daily case |
| C | 10 / 10 | Weekly semantics |
| G2 | 6 / 7 | Full vs incremental parity under out-of-order appends |
| D1 | 5 / 8 | DST spring-forward |
| D2 | 5 / 8 | DST fall-back |
| D3 | 2 / 2 | Weekly anchor across both transitions |
| M2 | 2 / 3 | Single shared boundary implementation |
| I | 1 / 7 | Multichart mixed-symbol isolation |
| J | 1 / 4 | Correctness-class absence is announced |
| K | 1 / 9 | Boundary cache is on the path |
| 0, A, A2, E, F, F2, G, H, K2, L, M, M3 | 0 | Differential / structural cells that must stay green |

### 4.1 Cell N — the assertion whose absence caused rejection 1

This is the cell Manager A asked to read first. It asserts three separate things, because the block was caused by a patch that would have satisfied any weaker version.

**1. Structural.** The properties the patch reads are scraped **from the patch text itself** and checked against `chart.js` assignment counts, so the assertion cannot drift away from the wiring:

| Assertion | Value |
|---|---|
| `patch-reads-only-declared-symbol-properties` | `currentSymbol` |
| `chart.js-assigns-this.currentSymbol` | 13 assignments ✅ |
| `chart.js-does-not-assign-this.sessionCalendarSymbol` / `.currentPair` / `.symbol` / `.pair` | **0, 0, 0, 0** — the rejected patch's four properties, confirmed non-existent and recorded as such |

**2. Resolution.** Ten real `currentSymbol` shapes → non-empty class; four unidentifiable shapes → `null`, never a guessed FX session, each announcing `SessionCalendar.unresolved-instrument`.

**3. Effect.** With **only** product-set properties populated — the shape that exposed the no-op — output must move:

| Assertion (`broken` state) | Actual today | Expected |
|---|---|---|
| `class-for:EURUSD` | `null` (no resolver exists) | `fx` |
| `class-for:EURUSD_FULL_1MIN_1MIN` | `null` | `fx` |
| `class-for:20251028_194229_GBPUSD` | `null` | `fx` |
| `product-shape-changes-daily-output:EURUSD` | `true` (**identical to pre-fix digest**) | `false` |
| `product-shape-has-friday-session:EURUSD` | `false` | `true` |
| `product-shape-has-no-phantom-saturday:EURUSD` | `true` (**the phantom bar is there**) | `false` |

Reproducing the reviewer's own two-shape comparison, now as a permanent gate:

```
harness-invented property (rejected patch):  symbol="EURUSD"  buckets=20  friday=PRESENT  sameAsBroken=false
REAL product chart, r1 patch:                symbol=""        buckets=24  friday=ABSENT   sameAsBroken=true
REAL product chart, r2 patch:                class=fx         buckets=20  friday=PRESENT  sameAsBroken=false
```

All five FX label shapes now produce `buckets=20, friday=PRESENT, sameAsBroken=false`. The unidentifiable shapes produce `buckets=24, sameAsBroken=true` **plus** a degraded-mode announcement.

### The PO-confirmed 2013-01-04/05 EURUSD case (cell B)

| Assertion | Actual today | Expected |
|---|---|---|
| `friday-session-open-bucket-exists` | **ABSENT** | `2013-01-03T22:00:00.000Z` |
| `friday-bucket-ohlcv-equals-friday-session` | `null` | `{o:1.3671875, h:1.508056640625, l:1.238037109375, c:1.289794921875, v:42060}` over 24 raw bars |
| `phantom-saturday-5-jan-1900-bar-absent` | `true` (**the bar exists**) | `false` |
| `friday-session-bar-is-stamped-thu-1700-et` | `false` | `true` |
| `every-daily-bar-named-a-weekday` | `2012-12-30/Sun \| 2013-01-06/Sun \| 2013-01-13/Sun \| 2013-01-20/Sun` | `none` |
| `no-weekend-named-daily-bars` | `2012-12-30(Sun)@2012-12-30T00:00Z \| 2013-01-06(Sun)@2013-01-06T00:00Z` | `none` |
| `every-daily-open-is-1700-eastern` | `24 off-anchor, first=2012-12-30T00:00:00.000Z@19:00` | `none` |
| `sunday-reopen-folds-into-monday-open` | `ABSENT` | `1.25` (the Sunday 17:00 ET reopen bar's open) |
| `daily-bucket-count` | `24` | `20` (4 session weeks × 5 session days) |

The PO's decisive observation is reproduced verbatim by the real `_resampleDataFull`: a bar rendering as **`Sat 05 01 '13 19:00`** exists, and **no bar renders on Friday 4 Jan**. Four Sunday stub buckets exist across the fixture.

### Weekly (cell C)

| Assertion | Actual today | Expected |
|---|---|---|
| `weekly-open-instants` | `2012-12-27T00:00Z, 2013-01-03T00:00Z, 2013-01-10T00:00Z, 2013-01-17T00:00Z, 2013-01-24T00:00Z` | `2012-12-30T22:00Z, 2013-01-06T22:00Z, 2013-01-13T22:00Z, 2013-01-20T22:00Z` |
| `weekly-opens-render-sunday-1700-eastern` | `Wed 19:00 ×5` | `Sun 17:00 ×4` |
| `weekly-labels-are-mondays` | `2012-12-27/Thu … 2013-01-24/Thu` | `2012-12-31/Mon, 2013-01-07/Mon, 2013-01-14/Mon, 2013-01-21/Mon` |
| `legacy-epoch-week-open-absent` | `true` — `2013-01-03T00:00Z` renders as **`Wed 02 01 '13 19:00`** | `false` |
| `week-2013-01-07-ohlcv` | `null` | `{o:1.267578125, h:1.511962890625, l:1.239990234375, c:1.463623046875, v:188216}` over 120 raw bars |

The `Wed … 19:00` weekly stamps the PO read off the surface are reproduced exactly, from the real product code, on four consecutive weeks.

### DST (cells D1/D2/D3)

| Assertion | Actual today | Expected |
|---|---|---|
| D1 `local-anchor-minute-of-day-is-constant-1020` | `[1140, 1200]` (19:00 EST **and** 20:00 EDT) | `[1020]` (17:00 local, both sides) |
| D1 `exactly-one-23h-session` | `0` — span histogram `{"24": 13}` | `1` |
| D1 `transition-session-span-is-23h` | `ABSENT` | `82800000` |
| D2 `exactly-one-25h-session` | `0` — span histogram `{"24": 13}` | `1` |
| D2 `transition-session-span-is-25h` | `ABSENT` | `90000000` |
| D3 `spring-weekly-opens-sunday-1020` | `["Wed 1140", "Wed 1200"]` | `["Sun 1020"]` |

`[1140, 1200]` is the finding's UI evidence (20:00 EDT in late Oct, 19:00 EST in Dec) recovered as a value. The all-24h span histogram is the structural falsifier for any fixed-offset implementation.

### Path parity and single-implementation (cells G2, I, J, K, M2)

| Assertion | Actual today | Expected |
|---|---|---|
| M2 `full-path-consumes-the-shared-helper` | `true` (output unchanged when the helper is stubbed) | `false` |
| M2 `incremental-path-consumes-the-shared-helper` | `true` | `false` |
| I `fx-host-differs-from-crypto-panel` | `true` (identical — no instrument awareness) | `false` |
| J `absent-module-is-reported-not-silent` | `[]` | `["SessionCalendar"]` |
| K `boundary-cache-absorbs-the-rest` | `hits=0 recomputes=0` (helper not on the path) | reached |
| G2 `1d-unsorted-append-incremental-equals-full` | `inc=…,1.307861328125,34740` vs `full=…,1.381591796875,36363` | equal |
| G2 `1w-unsorted-append-incremental-equals-full` | `inc v=183670` vs `full v=185293` | equal |
| G2 `1d-staircase-append-incremental-equals-full` | `inc v=38436` vs `full v=41675` | equal |
| G2 `1d-deep-staircase-incremental-equals-full` | diverges | equal |

Cell G (sorted appends, daily and weekly) **passes today** — the two paths already agree for in-order arrival, with 479 real `_tryIncrementalResample` calls per timeframe. Cell G2 is the exception and is a **separate pre-existing defect**; see §8.

### Differential cells that must stay green (§A7) — all green today

Cells E, F, F2, H, L, M, 0, A, A2 pass in `broken` state. Monthly (`1mo`, `3mo`), intraday (`5m`, `15m`, `1h`, `4h` over three fixtures), crypto daily, and kill-switch-OFF output are pinned to SHA-256 digests measured on `634448817` and embedded as literal constants in the oracle. `fixed` state reproduces every one of them byte-for-byte.

## 5. §A5 evidence

Driver: `node "chart v 1.4/chart/modules/m22-session-calendar-fourstate.mjs"` → `m22-session-calendar-fourstate.json`.

**Headline count, corrected (item 7).** The oracle emits **274 rows in the wired states: 262 value assertions and 12 unconditional informational rows.** The informational rows are `note()` calls that record context and can never fail — `0:mode`, `0:lifted-method-digests`, `0:lifted-from-product`, `0:inventory-parseTimeframe-1wk-resolves-to-minutes`, `0:real-ChartDataPipeline-loaded`, `A:api-surface`, `D1:matrix`, `D2:matrix`, `K:stats`, `K:registry-calls`, `K2:stats-across-all-dst-fixtures`, `M3:full-deployment-file-set`. The `broken` state emits 272 rows / 260 value assertions: two crypto-weekly post-fix digest assertions are wired-state-only.

The count is derived, not asserted by hand — the inverted run fails exactly 262, which **is** the set of real assertions, and the 12 that survive inversion are precisely the informational rows.

**Four-state proof (§A5.3).** All four states behaved as required:

| State | What it is | Expected | Observed | Failed assertions |
|---|---|---|---|---|
| `broken` | real product as committed | fail | **fail** | **84 / 260** |
| `fixed` | product + in-memory `WIRING_PATCH` | pass | **pass** | **0 / 262** |
| `corrupt` | `fixed`, but the helper's 17:00 anchor is corrupted to 16:00 | fail | **fail** | **32 / 262** |
| `inverted` | `fixed`, every value assertion inverted | fail | **fail** | **262 / 262** |

The corrupted state matters: a **one-hour** error in the dependency the oracle trusts is caught in cells A, B, C, D1, D2, D3 and N, so the gate is not merely detecting "session-shaped output".

The inverted control is exact: **every one of the 262 value assertions inverts**, none survives. Nothing in the oracle is a tautology.

**3× repeat (§A5.4).** Each state ran 3× on the authoring clock plus once under each of **seven** alternate timezones — **40 runs total.** Every run matched its expected verdict and every state produced an identical failure count on every run: `fourStateProofHolds: true`, `determinismHolds: true`.

**Different clock / host (§A5.4).** The independent reviewer of rejection 1 ran four zones this driver did not and reproduced identical results; those zones are now **adopted into the packet's own evidence** rather than being carried by the review notes. Zones exercised:

| Zone | Why it is hostile |
|---|---|
| `UTC` | baseline |
| `Asia/Tokyo` | +09:00, no DST |
| `Pacific/Kiritimati` | +14:00 — host local date differs from UTC for most of the day |
| `Asia/Kathmandu` | +05:45 — fractional fixed offset |
| `America/Santiago` | southern-hemisphere DST, **opposite phase** to `America/New_York`, so a host-zone leak shows as a sign flip |
| `Australia/Lord_Howe` | +10:30 / +11:00 — fractional offset **and** a 30-minute DST shift, in the opposite phase |
| `Pacific/Chatham` | +12:45 / +13:45 — fractional offset with a full-hour DST shift |

**A physically different host was not available to this worker.** That is acceptable here because host timezone is the only environment variable that could plausibly change the result — every boundary is resolved for an *explicit* zone, never the host default, and no assertion reads the wall clock. What remains unverified is **ICU/tzdata version coverage**: a second host with a different ICU build would test that, and is listed in §9.

**Nondeterminism ban (§A5.6).** Cell L is a structural self-lint over the oracle, the harness and the helper, banning `Date.now(`, zero-argument `new Date()`, `Math.random`, `randomUUID`, `performance.now`, `process.hrtime` and `requestAnimationFrame`. Needles are assembled at runtime so the cell cannot match itself. It also asserts no epsilon literal and no `Math.abs(...) < n` comparison exists in the oracle.

**Epsilon: 0, exact equality.** Justified structurally, not fitted. Fixture prices are dyadic rationals (`1.25 + k/4096`), exactly representable in IEEE-754; resampling performs only selection (first/last/max/min) plus integer volume sums, so no rounding can occur anywhere in the pipeline under test. There is no tolerance to tune.

**Provenance / staleness (§A5.5).** Authored against build `634448817`, row "Session-calendar bucketing (canary blocker)", last proven RED on `634448817`. Every evidence file records the git SHA, the SHA-256 of `chart.js`, `chart-data-pipeline.js` and `session-calendar.js`, and the SHA-256 of each of the three lifted product methods.

**Negative control (§A5.1).** Cell H is the permanent switch-OFF cell: with `__TALARIA_DISABLE_SESSION_CALENDAR_V1` set, daily and weekly output returns to the pinned pre-fix digests **and the defects come back as values** — no Friday session bucket, the `Sat 05 01 '13 19:00` bar present again, the epoch week open present again, and the two paths still agreeing. It passes in `fixed` state, which is what makes it a real control rather than a declaration.

## 6. Fidelity — how the real product code is executed

`chart.js` cannot be `require`d (top-level `document` access, auto-init on `DOMContentLoaded`, ~42k lines of browser-only surface). **Technique used: a `node:vm` harness over the real file, scoped by verbatim method lifting.**

`m22-session-calendar-harness.mjs` reads `chart v 1.4/chart/chart.js` and lifts the exact source text of `parseTimeframe`, `_prepareBarsForResampling` and `_resampleDataFull` by brace-matching (skipping strings, template literals and comments), then evaluates them in one VM realm together with the **unmodified** `chart-data-pipeline.js` (which carries the real `_tryIncrementalResample`) and the real `session-calendar.js`.

Extraction is fail-closed: a missing site, a duplicate site, or a lifted text that has lost an expected needle throws. Cell 0 additionally asserts that the lifted `_resampleDataFull` **contains the defect formula** `Math.floor(candle.t / timeframeMs) * timeframeMs` **if and only if `productIsWired()` is false** — so this assertion inverts at the moment Manager A lands the patch rather than going stale — that `parseTimeframe` returns 86400000 / 604800000, and that the loaded `ChartDataPipeline` is the real class (`RENDER_BAR_BUDGET` present). The SHA-256 of each lifted method is published in every evidence file so a reviewer can diff it against the file.

**Recorded, per Manager A: the brace matcher skips strings, template literals and comments, but *not* regex literals.** A regex containing an unbalanced brace or a `{n}` / `{n,m}` quantifier would be counted as structure and the lift would end in the wrong place. It works today only because none of the lifted methods contains such a literal — `_resampleDataFull` holds `/^(\d+)mo$/`, which has no quantifier braces. **That is a property of the current source, not of the construction.** A tokenizer is the real fix and is out of scope for this packet; two things make the luck survivable in the meantime:

- `EXPECTED_NEEDLES` re-checks each lifted body for text that appears only at its very end, so a short lift throws rather than silently truncating;
- `assertNoRegexBraceQuantifier` (added in r2) **fails the lift outright** if a brace quantifier ever appears in a lifted body, so the day the source acquires one the harness stops instead of mis-lifting.

Reported to Manager A as a follow-up rather than attempted here.

**`productIsWired()` is now a real transition (item 3).** `LIFTED_METHODS` declares five methods: the three that always exist, plus `_sessionBucketStart` and `_sessionInstrumentClass`, which are lifted **only when present in the product**. Before wiring, the patch injects them; after wiring, they come out of `chart.js` and the patch is skipped. Cell 0 asserts `wired-methods-lifted-iff-product-is-wired`, so the two worlds cannot diverge silently. Previously the synthetic host would simply have lacked `_sessionBucketStart` and both states would have thrown `TypeError` the moment wiring landed.

No cell reimplements the bucket formula and compares it to itself. The independent expected values come from two sources that are not the module under test: hand-derived literal epoch constants in `EXPECTED` (the PO dates, the four week opens, both DST transition instants), and `aggregateWindow`, a plain OHLCV reducer over the fixture.

**The `fixed` state is a simulation, not a product edit.** `WIRING_PATCH` expresses the proposed diff as exact find/replace pairs applied **in memory only**; each pair must match exactly once or the harness throws. It therefore doubles as a machine-checked wiring instruction that cannot silently rot, and `productIsWired()` makes the oracle switch to the real product automatically once Manager A lands it — `broken` today, GREEN after wiring, with no edit to the test.

## 7. Wiring instructions for Manager A (not applied)

`WIRING_PATCH` in the harness holds the exact diff.

### This is a FOUR-file change (item 6)

`chart v 1.4/chart/**` is the authoring tree; **`homepage/public/chart/**` is what is actually served.** Both bucketing files exist twice:

| # | File | Edits |
|---|---|---|
| 1 | `chart v 1.4/chart/chart.js` | W1, W2, W3 |
| 2 | `homepage/public/chart/chart.js` | W1, W2, W3 — **the served copy** |
| 3 | `chart v 1.4/chart/modules/chart-data-pipeline.js` | W4, W5a, W5b |
| 4 | `homepage/public/chart/modules/chart-data-pipeline.js` | W4, W5a, W5b — **the served copy** |

Plus the helper itself and its mirror (copied, not patched; pinned byte-identical by cell M), for a six-file deployment set.

**Cell M3** (18 assertions) proves every one of the four files exists, accepts every patch pair at exactly one site, is actually changed by it, and is byte-identical to its counterpart **both before and after** the wiring. Nothing in the r1 oracle would have caught a divergent mirror of the two files that carry the fix.

### The edits

1. **W1/W2** — `chart.js _resampleDataFull`: replace both `Math.floor(… / timeframeMs) * timeframeMs` sites with `this._sessionBucketStart(…, timeframe, timeframeMs)`.
2. **W3** — `chart.js`: add `_sessionBucketStart()` and **`_sessionInstrumentClass()`** (renamed from `_sessionCalendarSymbol()` in r2, because it now returns a class rather than a symbol string). `_sessionBucketStart` is the single boundary entry point; if the module is absent it uses the legacy floor **and** calls `window.__talariaMarkMissingModule('SessionCalendar')`; if instrument identity is unresolved it uses the legacy floor and announces `SessionCalendar.unresolved-instrument` (§A4c correctness class, §3.1).
3. **W4** — `chart-data-pipeline.js _tryIncrementalResample`: route `bucketStart` through `chart._sessionBucketStart`, so both paths share one implementation by construction.
4. **W5a/W5b** — `chart-data-pipeline.js`: seed a running maximum of raw `t` whenever the full resample writes the cache, and bail to the full resample when an appended bar falls behind it. See §8.1.

Also required in the same change:

- Move the `module` object from `session-calendar.contract.json` into `scripts/module-contracts.json`, **and** add `<script src="/chart/modules/session-calendar.js">` to every owned-stamped host and panel shell, **ordered after `market-calculations.js`** (new dependency, §3.1). The contract is shipped as a sidecar precisely because doing one without the other fails the build preflight by design — cell M asserts it is not yet in the manifest, and that the contract's `sharedCallSites[].wired` flags match `productIsWired()`, so the contract cannot go stale across the transition.
- Reconcile `parseTimeframe`'s missing `wk` unit with `classifyTimeframe` (§8.2).

## 8. Additional defects found (reported, not fixed)

**8.1 — `_tryIncrementalResample` folds out-of-order appends into the wrong bucket.** Cell G2. Pre-existing and **independent of the session calendar**: it reproduces in `broken` state too. The incremental branch assumes the appended bar is the newest and never checks. Requirement (f) named this case and a values gate that tolerated path divergence would be the lying-gate shape §A5 bans, so it is asserted rather than waived.

### Decision on W5 (item 4): KEPT, strengthened to a running maximum

Manager A offered either strengthening it or handing it back as its own row. **I kept it**, because dropping it would leave cell G2 permanently RED and requirement (f) explicitly names the unsorted-append case — the packet cannot satisfy its own brief without it. The correction is small and now demonstrably sufficient.

The reviewer was right that the r1 guard was incomplete. It compared only against `source[source.length - 2]`, so a **staircase** — one bar out of order, then a bar newer than its immediate predecessor but still older than the true maximum — sailed through. Reproduced here as a three-way differential:

| Guard | Simple out-of-order append | Staircase |
|---|---|---|
| **none** (product today) | **DIVERGE** — `inc v=38436` vs `full v=40059` | **DIVERGE** — `inc v=38436` vs `full v=41675` |
| **r1: previous-element** | AGREE | **DIVERGE** — `inc v=40059` vs `full v=41675` |
| **r2: running maximum** | AGREE | AGREE |

This is the reviewer's finding reproduced independently (they measured 40052 vs 41661 on their fixture indices; same mechanism, same magnitude). The r1 guard passed its own test and failed the property, exactly as stated.

**W5a** seeds `cache.maxRawT` wherever the full resample writes the cache — an O(n) scan inside a path that is already O(n), so asymptotically free. **W5b** bails when `lastRaw.t` falls behind that maximum, updates it otherwise, and **fails closed**: an unseeded maximum returns `null` and costs one full resample rather than trusting an inherited value.

Cell G2 now covers three arrival patterns for both `1d` and `1w` — simple, staircase, and a **deep staircase** of 40 ascending bars behind the maximum, so a guard that merely remembers "the last bar was out of order" cannot pass either. It also asserts `ordered-appends-still-use-incremental-path` (199 incremental calls), because a guard that always bailed would satisfy every parity assertion while quietly destroying the optimisation.

**This remains a separate pre-existing defect and Manager A may still prefer it as its own row.** The session-calendar wiring does not depend on it; it is bundled only because requirement (f) demands the parity assertion and the assertion cannot pass without it.

**8.2 — `parseTimeframe('1wk')` resolves to 60000 ms (1 minute).** `_getMaxBarsOnScreen` lists `1wk` as a weekly timeframe, but `parseTimeframe` has no `wk` unit and falls through to the minutes multiplier. Report-only inventory note in cell 0, deliberately not asserted so it cannot become a gate on buggy behaviour. `SessionCalendar.classifyTimeframe` does recognise `wk`, so wiring must reconcile the two or `1wk` will get session-week bucketing on a one-minute grid.

## 9. Not verified / deferred — explicit list

1. **Product wiring is not done.** By instruction. Everything in §4 stays RED until Manager A authorises it. The `fixed` state proves the oracle is satisfiable by the proposed diff, nothing more.
2. **No browser-surface verification.** The helper has never run in a shell. The oracle is Node-only; §A4c's runtime tripwire (`__TALARIA_LOADED_MODULES` on host **and** panel) and the build-time script-tag assertion both belong to the wiring change. The multichart cell (§A4b, cell I) simulates panels as separate VM realms, which covers module-instance isolation and mixed-symbol contamination but **not** iframe/CSP/load-order reality.
3. **No PO verification, no `PO-REQ` emitted.** §A12.3 requires automated gates green first; this packet is deliberately RED. A `PO-REQ` for the corrected daily/weekly chart belongs to the wiring packet.
4. **Different physical host not run.** Timezone was varied across **seven** zones instead, including opposite-phase and fractional-offset zones (§5). ICU/tzdata version differences between hosts remain unverified — the one environment axis that could still move a boundary.
4b. **The DST gap and ambiguity branches are untested.** Unreachable for both implemented classes; now documented as deliberate policy and instrumented with counters that cells K and K2 assert read zero. No fixture exercises them, and I did not synthesise an instrument class to manufacture coverage. §3.3.
4c. **The brace matcher does not skip regex literals.** It works by luck of the current source. Guarded by `assertNoRegexBraceQuantifier`, which fails the lift rather than mis-lifting, but a tokenizer is the real fix. §6.
5. **Real EURUSD session-877 data not used.** Fixtures are synthetic and deterministic by §A5.6 necessity (dyadic prices give epsilon 0). Weekend closures are hand-derived UTC constants for Dec 2012 – Jan 2013 only. **Real-data confirmation that the FX feed's Sunday reopen is exactly 17:00 ET across the whole backtest corpus is not done**, and the finding itself lists that as an open item ("confirm by hovering").
6. **Crypto weekly is a decision I made, not one I was given — now pinned, still awaiting ratification.** The Director stated crypto daily is 00:00 UTC and already correct. Weekly was unspecified; epoch weeks open **Thursday** 00:00 UTC (the Unix epoch was a Thursday), which is not defensible for crypto either, so I implemented **Monday 00:00 UTC**. The reviewer independently confirmed Monday is the industry convention, but that is not ratification.

   In r1 this was the one output changed on my own authority and the one output nothing asserted — `FROZEN_TODAY.crypto1w` was defined and never referenced. **Cell F2 now pins it on both sides** (item 5): the pre-fix digest `6376497b…` must match in `broken` and must *not* match once wired; the post-fix digest `ae285d4b…` and length 18 are pinned in the wired states; and the open weekday is asserted as `Thu` before and `Mon` after. "It moved" is no longer a sufficient answer — it must move to one specific, reviewable series. **Director/PO ratification of Monday 00:00 UTC is still owed before the wiring lands.**
7. **CME index futures and US equities not implemented.** Both declared in the registry with the calendar inputs they need, falling back to legacy epoch alignment. Ali's and Shahed's NQ/ES layouts therefore keep today's (wrong) daily bars after this fix. Worth stating in the known-limitations note if the canary cohort includes futures traders.
7b. **Datasets whose `currentSymbol` does not resolve keep the defect.** `FILE_<id>`, `CHART`, `EURUSD1` and a null symbol produce no instrument class, so daily and weekly stay epoch-aligned — announced via degraded mode, but still wrong on screen. See §3.1. This is the conservative direction (no value moves without positive identification) but it is a real coverage gap, and its size depends on how the canary cohort's files are named. **Worth a spot check of the cohort's actual `currentSymbol` values before the wiring ships.**
8. **Multi-day and multi-week timeframes (`2d`, `2w`) are not specified.** `classifyTimeframe` returns `handled: false` with reason `multiple-of-session-unit-not-specified`, so they keep epoch alignment. No such timeframe is currently reachable in the product's timeframe list; if one is added, the semantics need a decision.
9. **Migration audit not started.** The finding flags it and the Director called it "the real cost": drawings, journal entries and saved analysis anchored to daily/weekly bar timestamps will all shift by up to 7 hours (daily) or ~3.5 days (weekly). Nothing in this packet enumerates or migrates them. This is the largest unquantified item in the row.
10. **Cost measured, not soaked.** Cell K bounds zone work to ≤8 `Intl` calls per session day (observed 194 over 44,640 one-minute bars, i.e. ~0.4% of bars) using a derived rather than fitted bound, and bounds instrument-registry lookups to ≤2 per resample (observed 1 — resolution is memoised per symbol, not per bar). That is a unit-level bound; it is **not** an §A2 soak measurement, and §A9 requires memory cells with indicators and open trades that this packet does not run.
11. **CI integration not arranged.** The oracle fails by design today. Whether it lands as a permanent RED cell or is gated until wiring is Manager C's call (§A11.2 item 4, negative-control cells).
