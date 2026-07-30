# DOCTRINE — The chart owns only what it draws. Everything else lives in a cold room.

**Date:** 2026-07-30 16:15
**Origin:** PO architectural proposal, 15:57.
**Status:** adopted as standing architecture. Scoped for canary in §5.

---

## 1. The principle, as the PO stated it

> A position opens, gets an id and a trade box. Data is collected until the excursion
> window is over and screenshots are taken. Then the whole trade is moved out of chart
> memory into a bigger room organised by id. The only thing left on the canvas is two
> arrows — where the trade opened and where it closed. Same for indicators: settings go
> into a box on delete, recalled if the indicator returns. Same for multichart: symbol
> data leaves the chart when multichart closes.

**Adopted.** This is the correct architecture and it names the disease precisely: we have
been conflating *"the application needs this data"* with *"the chart object owns this
data."* Every finding today is an instance of that confusion — four panels each owning a
full base series, closed trades still owned by the live order collection, screenshots
owned by the position object.

The working set should be bounded by **what is being drawn now**, not by **everything
that has ever happened in the session**.

---

## 2. The correction that makes this cheap: the room already exists

The PO's proposal reads as building a new subsystem. It mostly is not.

**Trades are already persisted.** The session journal and the trade store already hold
every trade, organised by id, and the history and analytics windows already read from
them. The "bigger room" is built, populated and in production.

What we do today is keep a **redundant hot copy** on the chart, and then do per-candle
work on it forever. So the change is not "build a cold store and migrate trades into it."
It is **"stop keeping the second copy, and read the one that already exists when the
analytics window asks."**

That reframes this from a multi-day subsystem build into a deletion, which is a far safer
class of change and one that can be gated properly in the time available.

---

## 3. The two ways this goes wrong, and the rule that prevents both

### `EVICT-01` (new, binding)

> "Moved out of chart memory" means the hot reference is **released** and the cold read is
> **demonstrated to work**. A move from one JavaScript object to another JavaScript object
> on the same page is a relocation, not an eviction, and buys nothing.
>
> An eviction is only proven by two measurements together: retained bytes fall, **and**
> the data is still retrievable through the product path that consumes it.

We have been caught by relocation twice. `_reseedReplayFullRawFromLoadedData` moved
995 MB rather than removing it. The excursion `*_archive` arrays looked like relocation
and turned out — checked this afternoon — to be a genuine reduction, but only because
someone got the discard logic right. The failure mode is real and it is the default
outcome when nobody checks.

A legitimate cold room is one of: the server (re-fetch), disk-backed storage
(IndexedDB / the journal), or a **hard-capped** in-memory LRU. Another uncapped object on
the heap is not a room, it is the same pile with a new label.

### `EVICT-02` (new, binding)

> Eviction during replay is keyed to the **playhead**, never to wall time, and is
> **reversible**. A trade whose post-exit window has closed at playhead T is live again if
> the user rewinds behind T.

This is the defect the proposal would otherwise ship. "The excursion window is over" is a
statement in chart time. Users scrub, rewind and re-run. An eviction that assumes time
only moves forward will silently lose trade state on a rewind — and losing trade state is
the class of bug that was deleting user history two days ago.

---

## 4. Where I disagree: the multichart "temporary room"

The trade and indicator rooms I accept. The multichart warm cache I argue against, and
the argument is the PO's own.

The PO's diagnosis yesterday was exactly right: we built engines and retainers to hoard
data so charts would feel fast, never built flushing or caps, and the hoard became the
defect. **Caching four symbols' full datasets on multichart close, so it reopens fast, is
that same hoard with a friendlier name.** It would be the third generation of the same
mistake.

There is also a better fix available for the thing the cache is meant to solve. Multichart
reopen is slow today not because the data is absent but because the network path is
broken — B has found the window-claim path hanging with two requests never returning and
starving the whole origin, and nginx spooling hundred-thousand-candle responses to disk
before sending them. Fix those and a cold reopen is fast on its own merits.

**Ruling.** No multichart data cache for canary. A's base-series residency landing bounds
what a live panel holds; B's network fixes make the refetch quick. If reopen is still slow
after both, we revisit with a **capped, expiring** cache and a measurement showing the cap
holds — never an open-ended one.

---

## 5. Canary scope: one slice, chosen for value per unit of risk

Freeze is Saturday 06:00. The full doctrine across trades, indicators and multichart is
three subsystems and several days. Rushing all three is how we shipped a panel-freezing
cadence fix twice and a purge whose kill-switch reverted a bug fix nobody knew about.

**In scope for canary — trade eviction.** It is the highest value and the lowest new
machinery, because §2 means the destination already exists. It kills two named defects at
once:

- the **memory** term — per-order base64 screenshots, the unexamined half of the
  `ExternalStringData` growth
- the **CPU/smoothness** term — the per-tick loop that is O(every order ever opened),
  because an evicted trade cannot be sampled per candle

Canvas keeps the entry and exit arrows and nothing else, exactly as the PO specified.

**Out of scope for canary, doctrine accepted for after:**

- **Indicator settings eviction.** Plausible but unmeasured. C measures indicator
  retention across add/change/delete before anyone writes a line. We have spent a week
  paying for fixes aimed by intuition; this one waits for a number.
- **Multichart cold room.** Argued against in §4.

---

## 6. Assignments

**D — `TRADE-EVICT-V1`.** Owner because this is order mechanics and D's audit lane closed.

Sequence, and the order is not negotiable:

1. **Prove the cold read first.** Before removing anything, demonstrate the history and
   analytics windows render a complete trade — MAE, MFE, full path, screenshots — sourced
   from the journal with the hot copy already absent. If the cold path is incomplete, the
   eviction cannot ship and we learn that before deleting anything rather than after.
2. Define the post-exit bound in **playhead** terms per `EVICT-02`, and make it reversible
   on rewind.
3. Evict on bound completion: release screenshots and excursion arrays, drop the position
   from the per-tick sampling collection, retain only the arrow markers and the id.
4. Flag `__TALARIA_DISABLE_TRADE_EVICT_V1`, `FLAG-01/02/03`.
5. `EVICT-01` proof: retained bytes down **and** analytics still complete. Both numbers or
   it does not ship.
6. `CKPT-01` before starting. This is the money path.

**Top-tier review required.** Trade data is the product's core value and the failure mode
is losing a user's history.

**A — unchanged.** Base-series residency, then compact storage. The post-exit sampling cut
I assigned at 15:55 is **withdrawn from A and folded into D's eviction**, which subsumes
it: an evicted trade needs no sampling bound because it is not sampled. One mechanism, not
two.

**C — measure both sides.** Retained bytes per position for screenshot and excursion
fields, before and after. Indicator retention across add/change/delete, as the input to
the deferred decision in §5.

---

## 7. Honest note to the PO

This proposal is the first architectural instruction in this campaign that addresses cause
rather than symptom, and it would have saved a week if it had arrived a week ago. The
reason it is being scoped to one slice is not doubt about the design. It is that we are 38
hours from freeze and the discipline that has repeatedly failed us is doing three things
at once.

The doctrine is adopted. The trade slice ships for canary. The other two are written down
with owners so they do not evaporate after launch.
