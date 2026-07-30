# FINDING — Order excursion tracking is a TIME leak, not a memory leak. And the screenshots are unexamined.

**Date:** 2026-07-30 15:55
**Origin:** PO hypothesis — orders track data candle-by-candle from open until after close,
for MAE/MFE and trade paths; if implemented wrong, a contributor to memory, CPU and
smoothness.
**Read:** `homepage/public/chart/modules/order-manager.js` on the deployed tree.

---

## 1. Verdict in one line

The PO's hypothesis is **wrong about memory** (M19-B already bounded it, properly),
**right about CPU and smoothness** (and for a reason nobody has examined), and it
surfaces a **third term nobody has connected**: per-order screenshots as base64.

---

## 2. Memory: bounded, and bounded honestly. Not the culprit.

Per position, six excursion series are appended one sample per candle:
`bar_close_r`, `bar_high_r`, `bar_low_r`, and `post_exit_*` equivalents (`:5940-6008`).

`_m19ExcursionTailMaxV1()` returns **256** and the bound is on by default, kill-switch
`__TALARIA_DISABLE_M19_EXCURSION_TAIL_V1` disables (`:3942-3957`).

The important question was whether the bound is a **reduction** or a **relocation** — the
`*_archive` arrays and the comment at `:5970` ("archive + live == full lossless history")
read like relocation, which is the `_reseedReplayFullRawFromLoadedData` failure shape,
where 995 MB was moved rather than removed.

**It is a genuine reduction.** Reading `_m19ArchiveAndBoundExcursionSeries`
(`:5847-5905`): the archive absorbs only the *legacy backlog* present at first
activation, tracked by `pendingKey`. Once `pending` is exhausted,
`archiveLegacy = min(drop, pending)` is zero and further drops are folded into running
peak scalars and **discarded** (`:5897`, "Non-legacy drops → peaks only"), with
`bar_r_count` preserving the count. Steady state per position is ~6 × 256 numbers plus
scalars — order of 10 KB. A hundred trades is single-digit MB.

**Excursion arrays are not the memory monster.** M19-B did this correctly, including the
part that is normally got wrong. Credit stands.

---

## 3. CPU and smoothness: the PO is right, and this is new

The bound caps *storage*. It does not cap *work*. And the work has a property nobody has
looked at:

**`isPostExit` means closed trades keep being sampled** (`:5958-6008`, and `:6171`
"freeze in-trade excursion prices before post-exit tracking mutates them"). A closed
trade is not inert. It continues to consume per-candle work for the rest of the session.

So the per-tick cost during replay is **O(every order ever opened this session)**, not
O(open orders). Per order, per tick, we:

- compute `rValues` — which calls `_plannedRiskPrice` (`:6011`), itself doing multiple
  `Number.parseFloat` calls on `array_base_price`, `openPrice`, `initialStopLoss`,
  `initial_sl`, `stopLoss`. String-to-number parsing, per order, per tick.
- push into up to six arrays
- run `_m19BumpPeak` up to four times
- call `_m19ArchiveAndBoundExcursionSeries` twice, each doing array-length checks even
  when there is nothing to bound
- re-read `position.bar_r_count` and `post_exit_bar_r_count` through
  `Number.isFinite(Number(...))`

**This is a cost that grows with the length of the session and the number of trades
taken, and never falls back down.** It does not leak memory. It leaks time. Which is
precisely the `DUR-01` shape the PO added at 14:33, and precisely the symptom in the
original crash reports: *multichart + indicators + placing orders* → progressive
slowdown → ten seconds to react to a button.

It also explains, exactly, the observation that the lag appears **only when drawings,
orders or indicators are present** and not with replay alone. Replay alone has no
per-order per-tick loop.

---

## 4. The third term: screenshots as base64, per order

`_m19HotPersistHeavyFieldKeys()` (`:3980-3990`) lists what M19-C strips from hot
persists. Alongside the excursion arrays it names:

`entryScreenshot`, `exitScreenshot`, `entryScreenshots`, `railScreenshots`,
`screenshot`, `screenshotBase64`, `image`, `chartImage`, `thumbnail`, `preview`,
`screenshots`

M19-C is a **persistence** fix. It stops these being written into hot session patches.
It says nothing about whether they are **retained in memory**, and the fact that they
needed stripping proves they exist on the position object at runtime.

**This connects two findings that have been sitting apart all week.** C's snapshot census
named `ExternalStringData` as the top growing term and we attributed it to script source
per realm. Base64 image strings are also `ExternalStringData`. They would grow **one or
more per trade, per session**, never released, and they would be invisible to every
instrument we pointed at panel open/close cycles — because they are not per-panel, they
are per-trade.

Duration-dependent. Trade-count-dependent. Never measured.

---

## 5. The structural failure this exposes, which is mine

`CONF-01` says "indicators loaded, orders open." That specification is defective in the
same way the same-pair assumption was defective. It does not say **how many** orders, or
**accumulated over how long**.

Every harness in this campaign places a handful of orders and measures immediately. The
PO's testers place dozens over hours and every closed one keeps costing. We measured the
cheap configuration twice in one day: same-pair for panels, few-and-fresh for orders.

### `CONF-02` (new, binding, amends `CONF-01`)

> The reference configuration specifies order *accumulation*, not order presence: trades
> opened and closed continuously through the measurement window, reaching no fewer than
> thirty closed positions plus open positions by the end. A measurement taken with a
> handful of fresh orders carries no acceptance weight for CPU or smoothness.

---

## 6. Dispatched, without a PO test

**A — `POST-EXIT-SAMPLING-CUT`.** Closed positions must stop doing per-candle work once
their post-exit window is complete. Determine what post-exit tracking is actually *for*
(how far past exit the trade-path chart needs), bound it explicitly, and after that
bound make the position inert. Hoist `_plannedRiskPrice` to a value frozen at fill —
it derives from `array_base_price` and `initialStopLoss`, neither of which changes after
entry, so re-parsing it per tick is pure waste. Flag
`__TALARIA_DISABLE_M19_POST_EXIT_SAMPLE_BOUND_V1`, `FLAG-01/02/03`. **This queues behind
the base-series memory landing; it does not displace it.**

**C — measure it before A cuts it.** Two numbers: per-tick order-loop cost as a function
of closed-trade count, and total retained bytes of screenshot/base64 fields per position.
Both under `CONF-02`. The second number decides whether §4 is a real term or a footnote,
and it may be the missing part of the `ExternalStringData` growth C attributed to script
source.

**C — `C2` duration run is amended to `CONF-02`.** The two-hour run opens and closes
trades continuously to at least thirty closed positions. A two-hour run with three fresh
orders would have measured nothing and I nearly shipped it that way.

**D — fold into TAL-01941's verdict cell.** The randomised SL/TP soak already runs
inside C2; a run that accumulates trades is the same run. No second harness.

---

## 7. Honest note

MAE/MFE and trade-path capture is a **correct and valuable product feature** and nothing
here argues against tracking it. The defect is not that we track excursion. It is that a
closed trade is never allowed to stop, and that we re-derive a constant thousands of
times a second. Both are fixable without losing a single number the feature reports.
