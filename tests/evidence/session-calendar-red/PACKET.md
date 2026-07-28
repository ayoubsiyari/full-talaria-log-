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
| **Revision** | **r3** — finishing work on the accepted r2. See §0a. r2 history in §0b. |

---

## 0a. What changed in r3

r2 was accepted. This revision closes the one defect and three smaller items in the acceptance note, plus the two items the anchoring audit added.

| # | Required | Done |
|---|---|---|
| 1 | **Must fix:** memo poisoning — a transiently-absent registry became permanently absent | **Fixed.** `resolveIdentity()` now returns a `cacheable` flag distinguishing *"the registry says unknown"* from *"the registry was not there to ask"*, and the wiring caches only the former. Cache is additionally keyed on the engine instance. **Cell N2** is the recovery cell. §0a.1 |
| 2 | **Must add:** shell load-order coverage; establish whether the two shells are servable | **Both are servable — one is worse than static reading suggested.** **Cell M4** covers all eight `chart.js`-executing shells and asserts declared order, not presence. §0a.2 |
| 3 | **Should tighten:** cell N's structural half (two spoofs) | **Tightened, and re-attacked.** Four spoofs now caught including two the reviewer used and one whole class r2 never scanned. §0a.3 |
| 4 | **Should correct:** the broken-state denominator | **Corrected, and the split is now stated wherever a count appears.** §5 |
| 5 | **Record:** `EXPECTED_NEEDLES` comment is wrong about *why* it fails closed | Corrected in the harness. It fails closed at VM eval with `SyntaxError`, not via the needles. §6 |
| 6 | **Record:** the ambiguity counter does not detect ambiguity | Stated accurately, and **the vacuous assertion removed** rather than reworded. §3.3 |
| 7 | **Record:** futures mapping is a landmine | Boxed warning at the mapping site; §8.3. Mapping not restructured. |
| 8 | **New (audit):** third epoch-flooring site | `talaria-fvg-indicator.js periodStart()` — asserted as a census in cell M2 so "both paths fixed" can't be misread as "one day definition". §8.4 |
| 9 | **New (audit):** check the FX anchor against `api_server.py` | **Checked. Exact agreement, no disagreement to report.** This is now **cell P**, a standing differential. §3.4 |
| 10 | **New (audit):** shape the API for indicators | Explicit `anchor` parameter + `namedAnchors()`. Declared, not wired. **Cell Q.** §3.5 |
| 11 | Registry rows that would need adding | §8.5, with the suffix-stripping recommendation. |

### 0a.1 The memo fix

The reviewer's reproduction, before and after:

```
                        before registry    after registry loads    daily buckets
r2  (poisoned)          null               null                    24   <- still broken
r3  (fixed)             null               fx                      20   <- correct, Friday present
```

The mechanism r2 got wrong: it treated "no class" as one answer. It is two, and only one of them is a fact about the symbol.

- **`symbol-not-registered`** — the registry was asked and said no. Settled; safe to cache forever.
- **`registry-unavailable`** — there was nothing to ask. Not an answer at all; caching it converts a load-order race into permanent capability loss.

`resolveIdentity()` returns `{instrumentClass, cacheable, reason}` and the wiring honours `cacheable`. The cache is also keyed on the engine *instance*, so a realm that swaps engines cannot serve a stale class either. `reason` is retained because a future reader needs to know *why* a symbol is unresolved, and the boolean alone would not tell them.

**Cell N2** is the cell cell N was missing: engine absent at first call, engine installed into the live realm, then assert both that the class resolves and that the **daily output moves** — 24 buckets to 20 with the Friday session present. Cell N tested `omitMarketCalc`, which is permanent absence; it could never have caught this, and I should have seen that when I wrote it.

### 0a.2 Are those two shells servable? Yes. Both.

Answered from the live-origin audit artifact (`tests/evidence/b70-stage5/`, captured 2026-07-27 against `http://31.97.192.82:3000`), which records real nginx responses and the scripts each frame actually executed — not a static read of the HTML.

| Shell | Live? | Registry | Effect of the wiring there |
|---|---|---|---|
| `legacy-index.html` | **HTTP 200**, nginx | declared **after** `chart.js`, and **executes after it too** (exec index 38 vs 46) | Works, but by timing. Combined with r2's memo bug this was the realistic path to a permanent null — which is why item 1 mattered more than it looked. |
| `multichart/chart-host.html` | **HTTP 200**, nginx | **absent entirely** — 4 scripts, own comment says "engine (no modules — minimum surface)" | **The fix is inert here. Every panel keeps the phantom Saturday.** |

**Saying this plainly, as asked: `chart-host.html` is live, and it is not merely served-but-orphaned.** `multichart-shell.html` is also live (HTTP 200) and **embeds two `chart-host.html` iframes**, and the audit captured both child frames executing `/chart/chart.js` with no `market-calculations.js`. So this is a reachable user-facing surface with two broken panels, not a stale file. **You need this before it boards, and it is a wiring-change blocker, not a RED-half one:** the wiring must either add the registry to `chart-host.html` or the multichart surface ships a different calendar from every other surface.

Two further facts the shell sweep turned up that were not in the brief:

- There are **eight** `chart.js`-executing shells, not six. Six declare it as a `<script src>` tag; `multichart-prod/chart-embed.html` (both trees) builds its script list as a JS array and was invisible to a tag-only scan. It declares the registry first, so it is fine — but a tag-only inventory would have missed it, and cell M4 covers both mechanisms.
- **`multichart/chart-host.html` has drifted between trees.** The source tree carries a TF-switch viewport-preservation feature the served tree does not (26 lines). Script order is identical, so it does not affect this packet, and **I have not touched it** — copying an unmirrored feature onto the served tree to make a hash match is not a thing I should do quietly. Cell M4 asserts load-order identity and *reports* the body drift. Someone else's row.

### 0a.3 Cell N's structural half, re-attacked

r2's version sliced the patch text from a `_sessionInstrumentClass(` marker and filtered out anything starting `_session`. Both narrowings were walkable, as the reviewer showed. Replaced with: scan **all** wiring text across **all** patched files, strip comments and string literals so only *executed* code is examined, split reads into **data reads** (must be assigned in `chart.js`) and **method calls** (must be *defined* — a prototype method is never `this.x =`, and conflating the two is what would have forced the check to be loosened).

Re-run of the reviewer's spoofs plus two of my own:

| Spoof | r2 | r3 |
|---|---|---|
| `this._sessionFakeSymbol` (underscore filter) | passed | **caught** |
| phantom read placed above the marker | passed | **caught** |
| calls `this.resolveSymbolSomehow()`, a method that does not exist | not checked | **caught** |
| phantom `chart.timeframeLabel` introduced via the **pipeline** patch | **not scanned at all** | **caught** |

The exclusion list for the wiring's own internal names is itself asserted to contain no name the patch does not actually use, so it cannot be padded to hide a read.

---

## 0b. What changed in r2, and why

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
| `chart v 1.4/chart/modules/m22-session-calendar-bucketing.red.test.mjs` | The RED oracle. **28 cells; 342 value assertions + 25 informational rows wired, 340 + 25 unwired.** |
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

**Corrected in r3: the two counters are not equally good, and r2 claimed they were.**

- **The gap counter detects its condition exactly.** It fires on a failed round-trip, which is precisely what a non-existent wall time *is*. Cell K2 asserts it reads zero across both 2013 transitions and that assertion is meaningful.
- **The ambiguity counter does not detect ambiguity.** It fires when the two offset probes *disagree*, which is a near-transition signal and a different condition. The reviewer forced a genuinely ambiguous wall time: the module returned the correct earlier occurrence with `wallClockTransitionCrossings = 0`. So r2's `ambiguity-branch-never-taken` assertion was **partly vacuous**.

**That assertion has been removed rather than reworded**, and both the source and cell K2 now say plainly: **the ambiguity branch is unguarded.** The counter is kept as a cheap near-transition tripwire — both offsets are already in hand, so it costs nothing — but it must not be read as "no ambiguous time was requested". Detecting ambiguity properly needs a third offset probe on the far side of the transition, i.e. an extra `Intl` call on every boundary, which cell K's cost bound does not permit for a branch no implemented class can reach. That is a decision, and it is recorded as one. Cell K2 asserts the source carries the warning, and asserts that **no cell anywhere asserts zero on that counter**, so the vacuous check cannot creep back.

A non-zero *gap* count means an added class has entered an untested branch and must re-prove the anchor invariant before shipping.

## 3.4 Cross-check against the server — the existing authority

The audit is right that this is the higher-value consistency check, and it is now a standing cell rather than a one-off.

`api_server.py:8465-8499` `_is_weekend_timestamp_ms` already implements the FX weekend close at **17:00 `America/New_York`, DST-aware**, and its docstring explicitly rejects the naive UTC weekday check for the same reason this packet exists. It is not one of the seven guesses; it is the one place that already got this right. So the module matches it rather than re-deriving it.

**Cell P** transcribes the Python predicate faithfully into JS — weekday and hour in `America/New_York`, nothing else, deliberately *not* expressed through `SessionCalendar` internals, since a differential against my own arithmetic would prove nothing. It then locates every server open and close over **2013–2015 at minute resolution** and compares against this module's boundaries.

| Check | Result |
|---|---|
| Server transitions found | **156 closes, 156 reopens** |
| Every server **close** is exactly a daily session open | **156 / 156** |
| Every server **reopen** is exactly a daily session open | **156 / 156** |
| Every server **reopen** is exactly a **weekly** session open | **156 / 156** |
| Every weekly open this module produces is a server reopen instant (converse) | **156 / 156**, zero spurious |
| Distinct local anchor across three years | **Sunday 17:00**, one value |

**Disagreement to report: none.** Both directions are asserted, so agreement cannot be one-sided — without the converse, a helper opening weeks twice as often would still have passed. Cell P also pins five exact strings from the Python source, so if the server's rule is ever edited the cell fails instead of silently comparing against a stale transcription.

Boundary convention matches too: the server treats Friday 17:00:00 as closed and Sunday 17:00:00 as open, i.e. half-open `[open, next_open)`, which is the same convention `bucketStart` uses.

## 3.5 Indicator-facing surface — shaped, nothing migrated

Per the design note. `bucketStart` and `openLocalTime` accept an explicit `anchor` (`{zone, dailyOpenMinute, weekOpenWeekday, labelOffsetDays}`) in place of an instrument class. The boundary engine was already parameterised on exactly those fields, so this is an exposed extension point rather than a second code path.

`namedAnchors()` declares the two the audit named, **status `declared`, read by nothing**:

| Anchor | Value | Source |
|---|---|---|
| `fvg-18-et` | 18:00 `America/New_York` | `talaria-fvg-indicator.js periodStart()` |
| `weekly-map-mon` | Monday 00:00 `America/New_York` | `talaria-weekly-map-indicator.js` |

**Cell Q** proves the surface can actually absorb them rather than merely intending to: an explicit anchor equal to the `fx` class reproduces `fx` bucketing on every fixture bar (so the extension point is not a second implementation); both named anchors compute, opening at 18:00 local and Monday 00:00 local in **both** winter and summer, checked in wall-clock terms so a DST error cannot hide behind a matching UTC offset; and a malformed anchor fails **closed** to epoch alignment rather than silently defaulting to some class's calendar.

**Flagged, not reconciled:** `fvg-18-et` disagrees with the FX session open by **exactly one hour**, pinned as a value in cell Q. That disagreement is real and is one of the seven calendars the audit found. Unifying them is a separate row; I have made it visible, not decided it.

**Kill-switch: `__TALARIA_DISABLE_SESSION_CALENDAR_V1`** (correctness class, §A4c). Absent → session calendar active. Truthy → every call returns `Math.floor(t / timeframeMs) * timeframeMs`.

## 4. RED proof — what fails today, with values

**On denominators, corrected per r3 item 4.** The two states do not run the same number of assertions, and the packet now says which applies where:

| State | Assertions executed | Why |
|---|---|---|
| `broken` (unwired) | **365** | Cell F2's `if (WIRED)` block and cell N2's post-recovery clause only execute once the wiring is present. |
| `fixed` / `corrupt` / `inverted` (wired) | **367** | Full set. |

`M22_SC_STATE=broken` (real product as committed): **90 of 365 fail.** Full record: `m22-session-calendar-broken.json`.

| Cell | Failing | Subject |
|---|---|---|
| **N** | **40 / 54** | **Product wiring resolves a real instrument class and moves real output** |
| B | 11 / 11 | PO-confirmed 2013-01-04/05 daily case |
| C | 10 / 10 | Weekly semantics |
| G2 | 6 / 7 | Full vs incremental parity under out-of-order appends |
| **N2** | **5 / 7** | **Late-arriving registry must still resolve — the memo must not poison** |
| D1 | 5 / 8 | DST spring-forward |
| D2 | 5 / 8 | DST fall-back |
| D3 | 2 / 2 | Weekly anchor across both transitions |
| M2 | 2 / 12 | Single shared boundary implementation (+ epoch-flooring-site census) |
| I | 1 / 7 | Multichart mixed-symbol isolation |
| J | 1 / 4 | Correctness-class absence is announced |
| K | 1 / 9 | Boundary cache is on the path |
| 0, A, A2, E, F, F2, G, H, K2, L, M, M3, M4, **P**, **Q** | 0 | Differential / structural / external-authority cells that must stay green |

Cells **P** (server agreement) and **Q** (anchor surface) are green in `broken` by design — they assert properties of the helper and of an external authority, neither of which depends on the product being wired. They are not padding: both fail in `corrupt`, which is what makes them load-bearing.

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

**Headline count, with the denominator split stated (r3 item 4).** r2 quoted a single figure; there are two, and quoting one as if it covered both was the error.

| | Rows emitted | Value assertions | Informational rows |
|---|---|---|---|
| **Wired** (`fixed` / `corrupt` / `inverted`) | **367** | **342** | 25 |
| **Unwired** (`broken`) | **365** | **340** | 25 |

The two-row difference is cell F2's `if (WIRED)` crypto-weekly post-fix digest block plus cell N2's post-recovery clause; both only execute once the wiring is present. Informational rows are `note()` calls that record context and can never fail.

The count is derived, not asserted by hand — the inverted run fails exactly 342, which **is** the set of real assertions, and the 25 that survive inversion are precisely the informational rows.

**Four-state proof (§A5.3).** All four states behaved as required. Note the differing denominators, per above:

| State | What it is | Expected | Observed | Failed |
|---|---|---|---|---|
| `broken` | real product as committed | fail | **fail** | **90 / 365** |
| `fixed` | product + in-memory `WIRING_PATCH` | pass | **pass** | **0 / 367** |
| `corrupt` | `fixed`, but the helper's 17:00 anchor is corrupted to 16:00 | fail | **fail** | **40 / 367** |
| `inverted` | `fixed`, every value assertion inverted | fail | **fail** | **342 / 367** |

The corrupted state matters: a **one-hour** error in the dependency the oracle trusts is caught in cells A, B, C, D1, D2, D3, N and now **P** — the server differential catches the corruption independently of every fixture in this packet, which is the point of having an external authority in the matrix at all.

The inverted control is exact: **every one of the 342 value assertions inverts**, none survives. Nothing in the oracle is a tautology.

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

**Corrected in r3: r2's claim about *why* this fails closed was wrong.** r2 said `EXPECTED_NEEDLES` catches a short lift because the needles sit at the end of each body. **They do not.** Both `_resampleDataFull` needles are in the monthly branch near the **top**. The reviewer injected a truncating regex that cut the lift from 98 lines to 57 and both needles still passed. The comment has been corrected in the harness. What the needles genuinely verify is that the lift *started* at the right method — useful, but not a length check.

It does fail closed, for a different reason:

- **`vm.runInContext` is the real backstop.** A truncated method body is not syntactically valid inside the synthetic host class, so evaluation throws `SyntaxError` before any assertion runs. Genuine fail-closed behaviour, just not the mechanism r2 described.
- `assertNoRegexBraceQuantifier` (added in r2) **fails the lift outright** if a brace quantifier ever appears in a lifted body — the targeted guard for the specific hazard above.

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

### 8.3 — RECORD, DO NOT FIX: the futures mapping is a landmine

`MarketCalculationEngine` types **all 30 futures rows** as `futures`, and `MARKET_TYPE_TO_CLASS` maps that single type to `cme-index-futures`. So energies (`CL`, `NG`, `RB`), metals (`GC`, `SI`, `HG`, `PL`), bonds (`ZB`, `ZN`, `ZF`, `ZT`), grains (`ZC`, `ZW`, `ZS`) and FX futures (`6E`, `6B`, `6J`, `6A`, `6C`, `6S`) all route to a class named after **index** futures.

**This is inert today** — `cme-index-futures` is `declared`, not `implemented`, so every one of those rows falls back to legacy epoch alignment and nothing changes. **It becomes a defect the moment someone implements that class with index-futures hours**, because grains and energies keep different sessions and would silently inherit the wrong ones. That is the same failure mode as the original defect, one layer up.

A boxed warning now sits at the mapping site in `session-calendar.js` naming the affected product groups and pointing here. **The mapping is deliberately not restructured**: splitting it correctly requires per-root session data that no oracle in this packet covers, and changing classification for 30 rows on the strength of an untested guess is precisely the move that produced the defect this packet exists to fix. Whoever implements `cme-index-futures` must split the mapping *first*.

### 8.4 — There is a THIRD epoch-flooring bucket site, and this packet does not fix it

The finding named two. The anchoring audit found a third: **`talaria-fvg-indicator.js:68-70` `periodStart(t, tfMs)`**, used at line 294, whose `tfToMs` accepts `d` (line 63) and `w` (line 64). It floors daily and weekly to the UTC epoch exactly like the two sites this packet wires.

**Not wired here — it is a separate row.** It is recorded as a **census assertion in cell M2**: three known sites, two wired by this packet, each pinned by the literal flooring expression, plus an assertion that the FVG timeframe parser still accepts `d` and `w`. So "both resample paths are fixed" can never be misread as "the codebase has one day definition", and if the third site's shape changes the cell fails rather than the note going quietly stale.

### 8.5 — Registry rows that would need adding (`market-calculations.js` is NOT writable here)

Requested list. The registry holds **120 rows**, not 119 — 59 forex, 30 futures, 17 crypto, 14 stocks. Symbols it cannot classify keep epoch alignment after wiring, so each missing row is a symbol the fix silently skips.

**The G10 cross matrix is missing exactly two rows.** All 28 conventional crosses over `{EUR,GBP,AUD,NZD,USD,CAD,CHF,JPY}` were enumerated; 26 are present.

| Group | Missing | Note |
|---|---|---|
| **G10 crosses** | `EURNZD`, `GBPNZD` | Completes the 28-pair matrix. Highest priority — both are mainstream. |
| **SGD crosses** | `AUDSGD`, `NZDSGD` (and `GBPSGD`, `CADSGD`, `CHFSGD`) | `EURSGD`, `USDSGD`, `SGDJPY` are present, so the family is started but not finished. |
| **Metals** | `XPTUSD`, `XPDUSD` | `XAUUSD`/`XAGUSD` present. Platinum and palladium absent; `XPDUSD` was not on the reviewer's list but has the same gap. |

**Also found — four rows that are registered but mis-typed**, which matters more than the absences because these resolve *confidently to the wrong thing*: `DXY`, `USDX`, `XTIUSD`, `XNGUSD` are all typed `forex`. None is spot FX. `DXY`/`USDX` are index quotes; **`XTIUSD` (WTI crude) and `XNGUSD` (natural gas) are energy contracts whose real session opens 18:00 `America/New_York`, not 17:00.** After wiring they get the FX session — a one-hour error, presented with full confidence, and `isRegistered()` will not catch it because the row exists. Recorded; the registry is not writable here.

**On suffix-stripping — where it belongs, and why.** Broker suffixes are **already half-handled, and the half that works is not the half one would guess**:

| Form | Resolves? | |
|---|---|---|
| `EURUSD.a`, `EURUSD_i`, `EURUSD-ECN`, `EURUSD.pro`, `EUR/USD` | **yes** | `_resolveRegistryKey` splits on `/ - _ .` and whitespace, then tries the longest segment |
| `EURUSDm`, `EURUSDc`, `EURUSDpro`, `EURUSDmicro`, `EURUSD#` | **no** | no separator to split on; `#` is not in the split set either |

**It belongs in the registry resolver (`_resolveRegistryKey`), not in the session-class mapping.** `EURUSDm` and `EURUSD` are the same instrument for *every* consumer of the registry — pip size, P&L, margin and session alike. Putting the rule in `classFromRegistry` would give the session calendar a symbol vocabulary the P&L path does not share, and two normalisation rules that are supposed to agree but live in different files are how drift starts. One resolver, one vocabulary. It is also the cheaper fix: the resolver already has the segment-splitting machinery and needs only a bare-suffix rule, whereas the mapping layer would need the whole thing rebuilt.

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
12. **`multichart/chart-host.html` will not receive the fix, and it is live.** §0a.2. The wiring change must add the registry and the helper to that shell or the multichart panel surface ships a different calendar from every other surface. **This is a wiring-change blocker and it is the one item on this list I would not let board without a decision.**
13. **The ambiguity branch is unguarded.** Not "untested" — unguarded. `wallClockTransitionCrossings` is a near-transition tripwire and does not detect the ambiguity condition; the vacuous assertion that claimed otherwise has been removed rather than reworded. §3.3.
14. **`multichart/chart-host.html` has drifted between the source and served trees** (26 lines of TF-switch viewport handling present in `chart v 1.4/` and absent from `homepage/public/`). Script order is identical so it does not affect this packet. **Reported, not touched** — reconciling it means choosing whether to ship an unmirrored feature, which is not my call. Cell M4 asserts load-order identity and reports the body drift.
15. **The indicator anchor surface is shaped but unused.** `namedAnchors()` declares `fvg-18-et` and `weekly-map-mon` with status `declared`; nothing reads them and no indicator was changed. Cell Q proves the surface absorbs both, which is a claim about the *surface*, not about the indicators. The FVG's one-hour disagreement with the FX session open is pinned as a value and **not reconciled**. §3.5.
16. **`XTIUSD` and `XNGUSD` will get the wrong session after wiring** — a confident one-hour error, not a fallback, because they are registered as `forex`. §8.5. The registry is not writable here, so this is handed over rather than fixed.
