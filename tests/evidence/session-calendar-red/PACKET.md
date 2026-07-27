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

---

## 1. What shipped

| File | Role |
|---|---|
| `chart v 1.4/chart/modules/session-calendar.js` | The shared session-calendar helper. Pure functions, no DOM, browser + Node. |
| `homepage/public/chart/modules/session-calendar.js` | Generated mirror, byte-identical (asserted by cell M). |
| `chart v 1.4/chart/modules/session-calendar.contract.json` | Machine-readable §A4c module contract, as a **sidecar**. See §7. |
| `chart v 1.4/chart/modules/m22-session-calendar-harness.mjs` | Real-product harness + deterministic fixtures + the proposed wiring diff. |
| `chart v 1.4/chart/modules/m22-session-calendar-bucketing.red.test.mjs` | The RED oracle. 20 cells, 160 value assertions. |
| `chart v 1.4/chart/modules/m22-session-calendar-fourstate.mjs` | §A5 driver: four-state proof × 3 repeats × 4 clocks. |

No product file was modified. `npm run preflight:module-contracts` still exits 0.

## 2. Label convention, as encoded

**`stamp-at-open` + session-date naming.** Recorded in three places that are cross-checked against each other by cell M: `SessionCalendar.LABEL_CONVENTION`, `session-calendar.contract.json → labelConvention`, and cell A's assertions.

- The bar's `t` **is the session open instant.** For FX that is 17:00 `America/New_York`, DST-aware.
- The **name** is a separate function, `sessionLabel(t, tf, opts)`, returning the session *date*: the open's local date **plus `labelOffsetDays`** (FX: 1, crypto: 0).
- Therefore, asserted as values in cell A:
  - a bucket opening **Sunday 17:00 ET** is named **`2013-01-07` / Mon**;
  - a bucket opening **Thursday 17:00 ET** is named **`2013-01-04` / Fri**.
- Consequence the display layer must honour: Friday's daily bar renders its open stamp as `Thu 03 01 '13 17:00` while being **named Fri 4 Jan**. The oracle asserts both halves (cell B `friday-bucket-screen-stamp`, `friday-bucket-label`).

## 3. Helper API surface

Published as `window.SessionCalendar` (and `module.exports`). Version `20260727b81`.

| Member | Contract |
|---|---|
| `bucketStart(tMs, tf, {timeframeMs, symbol?, instrumentClass?})` | **THE shared boundary.** Both resample paths must call exactly this. `timeframeMs` is supplied by the caller's own `parseTimeframe`, so the fallback answer can never drift from the caller's grid. Returns the bucket open instant. |
| `epochAlignedBucketStart(tMs, tfMs)` | The legacy formula, kept **inside** the helper so the kill-switch path is the same code and there is still only one implementation. |
| `sessionLabel(openMs, tf, opts)` | `{key, weekday, zone, convention, openLocalMinuteOfDay, openLocalWeekday}` — the naming convention. |
| `openLocalTime(openMs, opts)` | `{hour, minute, minuteOfDay, weekday, offsetMinutes}` — the DST assertion surface. |
| `classifyTimeframe(tf)` | `{handled, unit, count, reason}`. `1d`/`1w`/`1wk` handled; `Nmo` explicitly **not** handled (`calendar-month-branch-owns-this`); sub-daily **not** handled (`sub-daily-epoch-aligned-is-correct`). |
| `resolveInstrumentClass(symbol, opts)` | `fx` \| `crypto` \| `cme-index-futures` \| `unknown`. |
| `instrumentClasses()` / `describeClass(id)` | The extensible registry. |
| `explain(tMs, tf, opts)` | Diagnostic actual-vs-expected view used by the oracle. |
| `isEnabled()` | Kill-switch state. |
| `resetCaches()` / `stats()` | Boundary-cache instrumentation (cell K). |

**Instrument classes.** `fx` (17:00 America/New_York, week opens Sunday 17:00, DST-aware) and `crypto` (00:00 UTC, week opens Monday 00:00 UTC) are **implemented**. `cme-index-futures` is **declared, not implemented** — it names the three inputs it still needs (`cme-holiday-calendar`, `cme-daily-maintenance-break`, `cme-early-close-table`) and falls back to legacy epoch alignment, so wiring it changes nothing today. `unknown` is the safe default for anything unclassifiable: never guess a session.

**DST is not a constant offset.** Every boundary is resolved as a local wall-clock hour through the IANA zone database (`Intl.DateTimeFormat` + a two-pass wall→UTC inversion). Cell A2 asserts the same 17:00 anchor maps to offset −300 in January and −240 in June, so a fixed millisecond subtraction cannot reproduce it. Cells D1/D2 assert the structural consequence: exactly one 23h session at spring-forward and exactly one 25h session at fall-back.

**Kill-switch: `__TALARIA_DISABLE_SESSION_CALENDAR_V1`** (correctness class, §A4c). Absent → session calendar active. Truthy → every call returns `Math.floor(t / timeframeMs) * timeframeMs`.

## 4. RED proof — what fails today, with values

`M22_SC_STATE=broken` (real product as committed): **40 of 160 value assertions fail.** 10 of 20 cells fail; the 10 differential "must not change" cells pass. Full record: `m22-session-calendar-broken.json`.

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

Cell G (sorted appends, daily and weekly) **passes today** — the two paths already agree for in-order arrival, with 479 real `_tryIncrementalResample` calls per timeframe. Cell G2 is the exception and is a **separate pre-existing defect**; see §8.

### Differential cells that must stay green (§A7) — all green today

Cells E, F, F2, H, L, M, 0, A, A2 pass in `broken` state. Monthly (`1mo`, `3mo`), intraday (`5m`, `15m`, `1h`, `4h` over three fixtures), crypto daily, and kill-switch-OFF output are pinned to SHA-256 digests measured on `634448817` and embedded as literal constants in the oracle. `fixed` state reproduces every one of them byte-for-byte.

## 5. §A5 evidence

Driver: `node "chart v 1.4/chart/modules/m22-session-calendar-fourstate.mjs"` → `m22-session-calendar-fourstate.json`.

**Four-state proof (§A5.3).** All four states behaved as required:

| State | What it is | Expected | Observed | Failed assertions |
|---|---|---|---|---|
| `broken` | real product as committed | fail | **fail** | 40 / 160 |
| `fixed` | product + in-memory `WIRING_PATCH` | pass | **pass** | 0 / 160 |
| `corrupt` | `fixed`, but the helper's 17:00 anchor is corrupted to 16:00 | fail | **fail** | 27 / 160 |
| `inverted` | `fixed`, every value assertion inverted | fail | **fail** | 151 / 160 |

The corrupted state matters: a **one-hour** error in the dependency the oracle trusts is caught, so the gate is not merely detecting "session-shaped output".

**3× repeat (§A5.4).** Each state ran 3× on the authoring clock plus once under each of three alternate timezones. All 24 runs matched their expected verdict and every state produced an identical failure count on every run — `determinismHolds: true`.

**Different clock / host (§A5.4).** Run under `TZ=UTC`, `TZ=Asia/Tokyo` and `TZ=Pacific/Kiritimati` (UTC+14, so the host local date differs from UTC for most of the day). **A physically different host was not available to this worker.** That is acceptable here because host timezone is the only environment variable that could plausibly change the result — every boundary is resolved for an *explicit* zone, never the host default, and no assertion reads the wall clock. What remains unverified is **ICU/tzdata version coverage**: a second host with a different ICU build would test that, and is listed in §9.

**Nondeterminism ban (§A5.6).** Cell L is a structural self-lint over the oracle, the harness and the helper, banning `Date.now(`, zero-argument `new Date()`, `Math.random`, `randomUUID`, `performance.now`, `process.hrtime` and `requestAnimationFrame`. Needles are assembled at runtime so the cell cannot match itself. It also asserts no epsilon literal and no `Math.abs(...) < n` comparison exists in the oracle.

**Epsilon: 0, exact equality.** Justified structurally, not fitted. Fixture prices are dyadic rationals (`1.25 + k/4096`), exactly representable in IEEE-754; resampling performs only selection (first/last/max/min) plus integer volume sums, so no rounding can occur anywhere in the pipeline under test. There is no tolerance to tune.

**Provenance / staleness (§A5.5).** Authored against build `634448817`, row "Session-calendar bucketing (canary blocker)", last proven RED on `634448817`. Every evidence file records the git SHA, the SHA-256 of `chart.js`, `chart-data-pipeline.js` and `session-calendar.js`, and the SHA-256 of each of the three lifted product methods.

**Negative control (§A5.1).** Cell H is the permanent switch-OFF cell: with `__TALARIA_DISABLE_SESSION_CALENDAR_V1` set, daily and weekly output returns to the pinned pre-fix digests **and the defects come back as values** — no Friday session bucket, the `Sat 05 01 '13 19:00` bar present again, the epoch week open present again, and the two paths still agreeing. It passes in `fixed` state, which is what makes it a real control rather than a declaration.

## 6. Fidelity — how the real product code is executed

`chart.js` cannot be `require`d (top-level `document` access, auto-init on `DOMContentLoaded`, ~42k lines of browser-only surface). **Technique used: a `node:vm` harness over the real file, scoped by verbatim method lifting.**

`m22-session-calendar-harness.mjs` reads `chart v 1.4/chart/chart.js` and lifts the exact source text of `parseTimeframe`, `_prepareBarsForResampling` and `_resampleDataFull` by brace-matching (skipping strings, template literals and comments), then evaluates them in one VM realm together with the **unmodified** `chart-data-pipeline.js` (which carries the real `_tryIncrementalResample`) and the real `session-calendar.js`.

Extraction is fail-closed: a missing site, a duplicate site, or a lifted text that has lost an expected needle throws. Cell 0 additionally asserts that the lifted `_resampleDataFull` **contains the defect formula** `Math.floor(candle.t / timeframeMs) * timeframeMs`, that `parseTimeframe` returns 86400000 / 604800000, and that the loaded `ChartDataPipeline` is the real class (`RENDER_BAR_BUDGET` present). The SHA-256 of each lifted method is published in every evidence file so a reviewer can diff it against the file.

No cell reimplements the bucket formula and compares it to itself. The independent expected values come from two sources that are not the module under test: hand-derived literal epoch constants in `EXPECTED` (the PO dates, the four week opens, both DST transition instants), and `aggregateWindow`, a plain OHLCV reducer over the fixture.

**The `fixed` state is a simulation, not a product edit.** `WIRING_PATCH` expresses the proposed diff as exact find/replace pairs applied **in memory only**; each pair must match exactly once or the harness throws. It therefore doubles as a machine-checked wiring instruction that cannot silently rot, and `productIsWired()` makes the oracle switch to the real product automatically once Manager A lands it — `broken` today, GREEN after wiring, with no edit to the test.

## 7. Wiring instructions for Manager A (not applied)

`WIRING_PATCH` in the harness holds the exact diff. Five edits:

1. **W1/W2** — `chart.js _resampleDataFull`: replace both `Math.floor(… / timeframeMs) * timeframeMs` sites with `this._sessionBucketStart(…, timeframe, timeframeMs)`.
2. **W3** — `chart.js`: add `_sessionBucketStart()` and `_sessionCalendarSymbol()`. `_sessionBucketStart` is the single boundary entry point; if the module is absent it uses the legacy floor **and** calls `window.__talariaMarkMissingModule('SessionCalendar')` (§A4c correctness class).
3. **W4** — `chart-data-pipeline.js _tryIncrementalResample`: route `bucketStart` through `chart._sessionBucketStart`, so both paths share one implementation by construction.
4. **W5** — `chart-data-pipeline.js _tryIncrementalResample`: bail to the full resample when the appended bar is older than the previous newest bar. See §8.

Also required in the same change:

- Move the `module` object from `session-calendar.contract.json` into `scripts/module-contracts.json`, **and** add `<script src="/chart/modules/session-calendar.js">` to every owned-stamped host and panel shell. The contract is shipped as a sidecar precisely because doing one without the other fails the build preflight by design — cell M asserts it is not yet in the manifest, and that the contract's `sharedCallSites[].wired` flags match `productIsWired()`, so the contract cannot go stale across the transition.
- Reconcile `parseTimeframe`'s missing `wk` unit with `classifyTimeframe` (§8).

## 8. Additional defects found (reported, not fixed)

**8.1 — `_tryIncrementalResample` folds out-of-order appends into the wrong bucket.** Cell G2. Pre-existing and **independent of the session calendar**: it reproduces in `broken` state too. The incremental branch assumes the appended bar is the newest and never checks. Appending a bar 30h behind the newest gives, on `1d` today, `c=1.307861328125 v=34740` from the incremental path against `c=1.381591796875 v=36363` from the full path, and a bucket count of 12 vs 11. Requirement (f) named this case and a values gate that tolerated path divergence would be the lying-gate shape §A5 bans, so it is asserted rather than waived. Fix shape is three lines (patch `W5`) and is already validated by the `fixed` state. **Manager A may wish to open this as its own row**; the session-calendar wiring does not depend on it, but the oracle will stay RED on cell G2 until it lands.

**8.2 — `parseTimeframe('1wk')` resolves to 60000 ms (1 minute).** `_getMaxBarsOnScreen` lists `1wk` as a weekly timeframe, but `parseTimeframe` has no `wk` unit and falls through to the minutes multiplier. Report-only inventory note in cell 0, deliberately not asserted so it cannot become a gate on buggy behaviour. `SessionCalendar.classifyTimeframe` does recognise `wk`, so wiring must reconcile the two or `1wk` will get session-week bucketing on a one-minute grid.

## 9. Not verified / deferred — explicit list

1. **Product wiring is not done.** By instruction. Everything in §4 stays RED until Manager A authorises it. The `fixed` state proves the oracle is satisfiable by the proposed diff, nothing more.
2. **No browser-surface verification.** The helper has never run in a shell. The oracle is Node-only; §A4c's runtime tripwire (`__TALARIA_LOADED_MODULES` on host **and** panel) and the build-time script-tag assertion both belong to the wiring change. The multichart cell (§A4b, cell I) simulates panels as separate VM realms, which covers module-instance isolation and mixed-symbol contamination but **not** iframe/CSP/load-order reality.
3. **No PO verification, no `PO-REQ` emitted.** §A12.3 requires automated gates green first; this packet is deliberately RED. A `PO-REQ` for the corrected daily/weekly chart belongs to the wiring packet.
4. **Different physical host not run.** Timezone was varied across four zones instead. ICU/tzdata version differences between hosts remain unverified — the one environment axis that could still move a boundary.
5. **Real EURUSD session-877 data not used.** Fixtures are synthetic and deterministic by §A5.6 necessity (dyadic prices give epsilon 0). Weekend closures are hand-derived UTC constants for Dec 2012 – Jan 2013 only. **Real-data confirmation that the FX feed's Sunday reopen is exactly 17:00 ET across the whole backtest corpus is not done**, and the finding itself lists that as an open item ("confirm by hovering").
6. **Crypto weekly is a decision I made, not one I was given.** The Director stated crypto daily is 00:00 UTC and already correct. Weekly was unspecified; epoch weeks are Thursday-aligned, which is not defensible for crypto either, so I implemented **Monday 00:00 UTC**. This **changes crypto weekly output** — `crypto1w` is asserted at its pre-fix digest nowhere, and cell F2 pins only crypto *daily*. **Needs Director/PO ratification before the wiring lands.**
7. **CME index futures not implemented.** Declared in the registry with the three calendar inputs it needs, falling back to legacy epoch alignment. Ali's and Shahed's NQ/ES layouts therefore keep today's (wrong) daily bars after this fix. Worth stating in the known-limitations note if the canary cohort includes futures traders.
8. **Multi-day and multi-week timeframes (`2d`, `2w`) are not specified.** `classifyTimeframe` returns `handled: false` with reason `multiple-of-session-unit-not-specified`, so they keep epoch alignment. No such timeframe is currently reachable in the product's timeframe list; if one is added, the semantics need a decision.
9. **Migration audit not started.** The finding flags it and the Director called it "the real cost": drawings, journal entries and saved analysis anchored to daily/weekly bar timestamps will all shift by up to 7 hours (daily) or ~3.5 days (weekly). Nothing in this packet enumerates or migrates them. This is the largest unquantified item in the row.
10. **Cost measured, not soaked.** Cell K bounds zone work to ≤8 `Intl` calls per session day (observed 194 over 44,640 one-minute bars, i.e. ~0.4% of bars) using a derived rather than fitted bound. That is a unit-level bound; it is **not** an §A2 soak measurement, and §A9 requires memory cells with indicators and open trades that this packet does not run.
11. **CI integration not arranged.** The oracle fails by design today. Whether it lands as a permanent RED cell or is gated until wiring is Manager C's call (§A11.2 item 4, negative-control cells).
