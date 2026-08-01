# DISPATCH — A's queue is too long because I routed every performance finding to A. Cutting three items, moving two to C, and giving A an explicit order. B is legitimately blocked on A. B and C get parallel work that does not wait on the train.

**2026-07-28 17:42. PO: "manager A have too many queued and other managers B and C are stop."**

---

## 1. Director error, named

**Every performance finding today landed on A** — the rAF loop, the orphans, both lag fixes, now the hidden-replay leak, now the `rn` collections. **I treated "performance" as A's exclusive territory and never asked whether the diagnostic half of that work could go elsewhere.** Result: A queued deep while B and C ran dry.

**Correction: fixes in A's files stay with A. Identifying, gating and measuring do not have to.**

## 2. CUT from A — three items, gone

**CUT — M25 Packet 1, the `renderPending` accessor conversion.** Packet 2, the guard, was cancelled. **Packet 1 existed only as the precondition for Packet 2.** With the consumer gone the accessor is pure cost — 28 arming sites and 56 total writes touched for no shipped behaviour. **Cancelled.**

**CUT — SURF-1, surface equivalence.** Deferred earlier, now confirmed dead for canary. **Its purpose was to validate cross-shell CPU comparisons, and §7 of the hidden-replay finding puts those comparisons in doubt for an unrelated and larger reason.** Not worth resolving.

**CUT — M1-NARROW browser-half verification.** Moves to C, which owns gates.

## 3. MOVE to C — two items

**MOVE — identify `rn`.** Four collections, ~63,000 objects and ~6.6 MB each, count growing, oldest instances unchanged across snapshots hours apart. **This is read-only archaeology: find the minified class, find what constructs one, find why the old ones survive.** No writes to A's files, so it runs fully parallel to A.

**MOVE — M1-NARROW browser-half verification in a clean tree.**

## 4. A's queue, in explicit order — five items

**A has been given priorities but never a total order, and "too many queued" is often "no order."** This is the order.

**1. Kill-switch on the render-path fix.** Smallest item on the list and **it is the blocker on B's release train.** Unblocking another manager outranks own progress. Do this first.

**2. FIX 3 — pause replay when the page is hidden.** A missing event listener. **Smallest real fix available, the only one that attacks CPU and memory at the same time, and the only one that helps single-chart users.**

**3. M26 completion — the two missing parts.** Null `fullData` and delete the instance from the retaining `Map`. Without these, `destroy()` alone is why the fix is labelled "code-correct, effect not demonstrated."

**4. FIX 2 — per-tick allocation reuse.**

**5. FIX 1 — background-panel render cadence.**

**Serialisation note:** items 2, 3 and 4 all write `replay-system.js`. **Per PAR-01 those are intersecting writers and must run serial with each other** — but each can have its review pipelined against the next one's authoring, and item 1 is in a different file and runs parallel to all of them.

## 5. B — you are not idle, you are blocked, and the block is real

**B is waiting on A's kill-switch to close the train. That is a correct wait, not a stall.** A now has it as item 1.

**Parallel work that does not touch the train:**

- **Stamp a build ID on `/chart/index.html`.** Still unstamped, which is why the PO's measurements remain unattributable to a build. Independent of the train.
- **B-3 proper** — asymmetric server-confirmed disposability, asserts repositioned ahead of network contact per SAFE-01.
- **The live-surface probe** — finish it. DEPLOY-01 has no teeth until something can say what the running system actually serves.
- **New, and squarely your charter: pre-clear FIX 3's delivery path before it is written.** **We discovered the mirror and cache-stamp hazards *after* building a fix, twice.** Determine now which shells and mirrors carry `replay-system.js`, whether each gets rebuilt or served from committed bytes, and what stamps must move. **Hand A the answer before A ships, not after.**

## 6. C — four streams, three of them parallel

**Your queue kept emptying because your items were being dispatched one at a time. Here is a standing set.**

- **A hidden-tab regression gate.** **This is the cleanest GATE-01 opportunity we have had: today's code is the known-defective input, guaranteed, because the replay engine contains zero visibility handling.** Build a gate that fails when replay continues to tick while `document.hidden` is true. **It must go RED on today's code before A's fix lands.** If it goes green on today's code, the gate is wrong and you have caught it for free.
- **A "does it stop when hidden" census across every timer in the product.** Read-only. **Replay is the one we caught; assume it is not the only one.** Alerts, indicator performance, order manager, countdowns, pollers — enumerate every `setInterval`, `setTimeout` chain and rAF loop, and record whether each has any visibility or teardown condition. **Expect this to find more than one offender.**
- **Identify `rn`** per §3.
- **M-6 gate hardening** to the PO's conditions — four panels, indicators, an order, live replay — with inverted acceptance: **it must FAIL on today's code.**
- **The 4-panel replay benchmark**, still needed to grade A's FIX 1 and FIX 2.

**The census and the `rn` identification are read-only and run parallel to each other and to the gate work. Per PAR-01 there is no reason to serialise them.**

## 7. What this does to the critical path

**A's path shortens by three items and B's block gets resolved as A's first action.** The two things that were genuinely only-A — the fixes in A's own files — stay with A, and everything diagnostic around them moves to the two managers who were sitting idle.
