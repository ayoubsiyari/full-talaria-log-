# RULING — Final PO measurement in: leak is **linear and bounded at ~50 MB per cycle** (+52/+46/+52 on a clean 54 MB baseline). Whether the bar store is the mechanism is **unresolved pending one question** — if the kill-switch was set, the hypothesis is refuted. The PO has authorised **multiple simultaneous shots**, so the response is a parallel pack of five independently switched fixes plus one regression hunt, graded by an instrument C must build, because PO manual testing ends here.

**2026-07-29 03:40. "This is the last test I do."** Measurement now becomes the team's problem, permanently.

---

## 1. The final dataset

| run | baseline | R1 | R2 | R3 | growth |
|---|---|---|---|---|---|
| 12 symbols, 3 months (**contaminated baseline** — prior 4-symbol session not reloaded away) | 962 | 968 | 981 | 1036 | +74 MB |
| **4 symbols, clean 54 MB start** | 54 | 106 | 152 | 204 | **+150 MB (+52/+46/+52)** |

**The second run is the best memory data the project has produced: a genuinely fresh page, and growth that is linear rather than accelerating.** **Linear matters — it means bounded per cycle, no compounding, and a leak whose cost a user can be told in one sentence.**

**Unresolved and blocking interpretation: whether `__TALARIA_DISABLE_SHARED_BAR_STORE` was set.** **If it was, the bar-store chain is refuted as the dominant term and I must retract it as loudly as I proposed it.** **The retainer capture remains valid regardless** — it proved a live global reaching a Detached Window — **but a proven leak path is not automatically the leak.**

**This is `MEAS-01` applied to my own best evidence, and it holds even when the evidence is good.**

## 2. Why the answer moves the shots less than expected

**The pack below is deliberately built so that no single shot depends on the bar-store hypothesis being right.** **Three of the five attack realm-crossing retention by different routes, and if the bar store is innocent the other two still fire.** **After three wrong hypotheses in one night, betting the response on the fourth would be indefensible.**

## 3. Shot pack — A, all five in parallel, one switch each

**`PAR-01` applies: these touch disjoint writable sets except where noted, and A is to run them concurrently rather than serially.**

**Shot 1 — realm-correct store construction.** `chart.js:3191-3220`. Only the top window may construct the shared store. A panel finding no store must fall back to a **panel-local** store that dies with it, never construct one for the parent. Flag `__TALARIA_DISABLE_REALM_SAFE_BAR_STORE_V1`.

**Shot 2 — no foreign-realm objects in the shared store.** Even a host-constructed store pins a panel if it caches objects the panel created. **The captured chain runs through `cursors in {bars, cursors, updatedAt}`, which is cached payload, not the store's own scope** — so this is a distinct mechanism from Shot 1 and must not be folded into it. Copy bars and cursors into host-realm plain objects on `put`. Flag `__TALARIA_DISABLE_BARSTORE_REALM_CLONE_V1`.

**Shot 3 — evict on teardown.** `removeChart` must call `clearFile(fileId)` when no surviving panel references that file. Reference-counted, as with any shared resource. Flag `__TALARIA_DISABLE_MC_BARSTORE_PURGE_V1`.

**Shot 4 — parent-side panel references.** The reconcile loop purges five structures; enumerate the rest and purge them all. Flag `__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1` (already reserved).

**Shot 5 — engine unreachability after destroy.** Listeners, timers, observers, indicator handles. **Sized honestly: the engines are 376 bytes each, so this shot recovers almost nothing directly** — it is worth firing only because a reachable engine can anchor a realm. **Lowest priority of the five and the first to cut if A is saturated.**

## 4. Regression hunt — and this may outrank the leak

**The PO reports new behaviour: charts jitter until clicked, and replay pauses for about a second then resumes unprompted. Their own read is "maybe we broke something."**

**Concur, and there is an obvious suspect. FIX 3 pauses replay on `document.hidden` and resumes on visibility.** **A panel iframe's visibility state is not the user's attention**, and a spurious hidden→visible transition would produce precisely this: a one-second stall that clears itself, and staleness until an interaction forces a redraw.

**A is to audit FIX 3's pause predicate for spurious triggers before writing any of the five shots.** **A self-resuming pause in front of a canary user reads as a broken product in a way a slow memory climb never does**, and `REPLAY_HIDDEN_PAUSE_V1` already exists as the switch if it must come out.

## 5. Instrument — C, and this is now critical path

**PO manual measurement has ended. Nothing in section 3 can be graded without an automated replacement, and grading five parallel shots by feel is not possible.**

**C builds a heap-cycle memory gate:** `performance.memory.usedJSHeapSize` with forced collection, across three multichart cycles with distinct symbols, plus **`Detached <div>` counts from a snapshot comparison.**

**The Detached count is the superior gate and is required, not optional.** It is specific to the mechanism, immune to unrelated heap noise, and the PO's capture gives an exact expected magnitude: **+21,699 detached divs per cycle.** **`GATE-01`: it must read RED on today's build before any shot is graded against it.**

## 6. Standing correction

**Every "effect not demonstrated" verdict issued against footprint is void.** M26 and FIX 3 are re-graded on the new instrument once it exists. **No shot in section 3 may be accepted or rejected on Task Manager figures.**
