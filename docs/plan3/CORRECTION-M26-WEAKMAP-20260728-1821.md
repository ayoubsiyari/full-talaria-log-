# CORRECTION — I told A to delete the orphaned instance from a "strong Map". It is a WeakMap. That half of the instruction is wrong and would accomplish nothing. Nulling `fullData` stands. The real retainer is still unnamed.

**2026-07-28 18:21. Caught while answering the PO's question about A's serial queue. A has the incorrect instruction pending.**

---

## 1. What I told A, and what is actually true

**I told A:** *"`destroy()` does not null `fullData` — roughly 7.2 MB per instance — and does not remove the instance from the strong `Map` that holds it as a key."*

**Verified in source:**

```
replay-system.js:9089    const m20Q6States = new WeakMap();
replay-system.js:9090    const m20Q6ChartOwners = new WeakMap();
```

**Both are WeakMaps. WeakMap keys do not prevent garbage collection.** Deleting the instance from `m20Q6States` would change nothing about retention. **That half of my instruction is withdrawn.**

## 2. What survives the correction, and it matters

**`m20Q6DrainState` never nulls `fullData` or `fullRawData`.** I read the whole function, lines 9667–9854. It is thorough about everything else — it clears `playInterval` and five other timer fields, removes event entries, manager listeners and floating-clone document listeners, removes four DOM elements plus go-back overlays, deletes from `m20Q6ChartOwners`, and nulls `chart.replaySystem`. **It never touches the candle arrays.**

**So the instruction to null `fullData` and `fullRawData` on drain stands, and it is worth roughly 7.2 MB per orphan.** It is worth doing regardless of what retains the instance, because it releases the largest payload even while the shell object survives.

## 3. The uncomfortable consequence — we do not know what retains the orphans

**If the drain clears every timer, removes every listener, nulls `chart.replaySystem`, and both registries are weak — then nothing I have read explains how 17 instances stay alive.**

**Our stated mechanism for the multichart memory leak is therefore incomplete, not merely partially implemented.** I had believed the retainer was named. It is not.

**This cannot be closed by reading more code.** It requires a retainer path from a heap snapshot with a live orphan selected — the same technique that corrected the detached-DOM hypothesis earlier today. **Assigning to C**, which owns instrumentation and already needs a live orphan for the M-6 gate hardening; the gate work and the retainer path use the same fixture.

## 4. Two further hazards found in the same read

**(a) The drain throws when it cannot finish.** Lines 9843–9851: if any resource remains pending, or `state.page` is still set, it pushes an error and **throws an aggregate**. Line 9814 shows `phase` only reaches `destroyed` when `!errors.length && pending === 0 && !state.page`; otherwise `destroy-pending`.

**So a partially-successful teardown raises an exception out of `destroy()`.** If the multichart teardown path does not catch it, **every cleanup step after that call is skipped** — which is a candidate mechanism for the orphans that costs nothing to check. **A should verify the call site is wrapped.**

**(b) Drain is idempotent by early return.** Line 9671: `if (state.phase === 'destroyed') return state.lastReport;`. Correct for double-destroy, but it means **an instance that is destroyed and then has fresh state attached can never be cleaned again.**

## 5. Answering the PO's actual question — A's serial chain can be shortened

**The PO asked whether a manager must wait, and whether work can be moved to save time. B is not waiting: B has four items with disjoint writable sets. The manager who is genuinely queued is A, and the queue is A's three same-file fixes, which I serialised under PAR-01.**

**That serialisation is more conservative than it needs to be. The three fixes touch three widely separated regions:**

| Fix | Region |
|---|---|
| FIX 3, visibility pause | around the `setInterval` at **:4548** |
| M26 completion, null the candle arrays | inside the drain, **:9667–9854** |
| FIX 2, per-tick allocation reuse | the per-tick hot path |

**Roughly five thousand lines separate the first two. Conflicts between them would be nil or mechanical.**

**Ruling: A may author FIX 3, M26 completion and FIX 2 concurrently in separate worktrees, merging sequentially.** PAR-01's intersecting-writer rule is about *conflicting* writes, and I applied it at file granularity when region granularity was available and obviously safe here. **This roughly halves A's critical path.**

**Merge order: M26 completion first, then FIX 3, then FIX 2** — smallest and most independent first, so any conflict lands on the largest change rather than the smallest.
