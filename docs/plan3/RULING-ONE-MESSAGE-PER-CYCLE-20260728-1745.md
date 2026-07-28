# RULING — DISP-01. Four of my messages are stacked unread in A's inbox and they contradict each other. Delete all four, send one. Inbox depth is the Director's problem, not the manager's.

**2026-07-28 17:45. PO screenshot: Manager A shows "4 Queued" while still working.**

---

## 1. What is actually queued in A's inbox

1. **Charter** — `CHARTER-A-FAST-CHARTS-20260728.md`, which says *"It supersedes your queue."*
2. **M26 gap** — the retainer answer exposed that the merged fix only calls `destroy()`.
3. **PAR-01** — `RULING-PARALLELISM-20260728-1722.md`.
4. **Hidden-replay finding** — `FINDING-REPLAY-RUNS-HIDDEN-20260728.md`, adding FIX 3.

**And I was about to have the PO send a fifth**, the rebalance, which cuts three items and imposes a total order.

## 2. Why this is harmful, not merely untidy

**A processes these in order and re-plans on each one.** Message 1 says *supersedes your queue*. Message 5 says *cut M25 Packet 1, cut SURF-1, and here is a different total order.*

**So A would spend real cycles planning and possibly authoring against instructions that message 5 revokes — including M25 Packet 1, which is 56 code writes I have now cancelled.** The queue guarantees A does work I have already decided to throw away.

**This is the same failure as the 4.5-hour silence on A's escalation, inverted.** Then I starved A of direction. Now I am flooding A with direction faster than it can be reconciled. **Both are Director throughput failures presenting as manager problems.**

## 3. Ruling DISP-01 — one message per dispatch cycle

**A manager's inbox must not hold more than one pending Director message.**

- **If a new finding arrives while a message is still unread, the correct action is to delete and rewrite the pending message, not to append a second one.**
- **Detail lives in committed documents; the message carries only what supersedes, what is cut, and the order.** Documents can be read in any sequence without thrashing. Messages cannot.
- **Any message that says "supersedes your queue" must be the only message in the queue,** or it is false on arrival.

**Applies to all three managers. I have been firing one message per finding since we went continuous, and this is the predictable result.**

## 4. Action — delete all four, send the consolidated message in §5

**The four queued messages must be deleted unsent.** Their content is preserved in committed documents and is fully carried by §5. **The M26 gap in message 2 is the one item that exists nowhere else in dispatch form, so §5 states it explicitly.**

## 5. The single message

> **This supersedes everything in your queue. Four earlier messages were deleted unsent — their content is here and in the documents below. Read in this order: `CHARTER-A-FAST-CHARTS-20260728.md`, `RULING-PARALLELISM-20260728-1722.md`, `FINDING-REPLAY-RUNS-HIDDEN-20260728.md`, `DISPATCH-REBALANCE-20260728-1742.md`.**
>
> **CUT — do not start, and stop if started: M25 Packet 1, the `renderPending` accessor. Packet 2 was cancelled and Packet 1 was only its precondition, so it is 56 writes for no shipped behaviour. CUT: SURF-1. CUT: M1-NARROW browser half, C has it. MOVED to C: identifying `rn`.**
>
> **Your queue is these five, in this order:**
>
> **1. Kill-switch on the render-path fix.** Smallest item you have and **it is the blocker on B's release train** — unblocking another manager outranks your own progress.
>
> **2. FIX 3, pause replay when the page is hidden.** `replay-system.js` has zero occurrences of `visibilitychange`, `document.hidden` or `visibilityState`, and playback runs on `setInterval` at `:4548`. **PO left a single chart in a background window untouched: 1.24 GB, 18.8% CPU, detached divs 65,036 → 81,423, no multichart involved.** Kill-switch `__TALARIA_DISABLE_REPLAY_HIDDEN_PAUSE_V1`. Resume must not double-advance or skip candles. **`document.hidden` is true for a backgrounded window, not just a hidden tab — that is the PO's exact case.**
>
> **3. M26's two missing parts.** Answering the PO on retainers exposed the gap: **your merged fix calls `replaySystem.destroy()` at teardown, and that is all it does. `destroy()` does not null `fullData` — roughly 7.2 MB per instance — and does not remove the instance from the strong `Map` that holds it as a key.** That is precisely why the fix is labelled *code-correct, effect not demonstrated*. **Null the data and delete the Map entry.**
>
> **4. FIX 2, per-tick allocation reuse. 5. FIX 1, background-panel render cadence.**
>
> **PAR-01: items 2, 3 and 4 all write `replay-system.js`, so they are intersecting writers and must run serial with each other — but pipeline each one's review against the next one's authoring. Item 1 is in a different file and runs parallel to all of them.**
>
> **Going forward you will receive one message per cycle, not several. If your inbox ever shows more than one from me again, that is my defect.**
