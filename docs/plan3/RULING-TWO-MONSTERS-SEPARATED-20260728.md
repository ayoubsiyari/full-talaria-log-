# RULING — The residue theory is contradicted. Memory and lag are two separate defects, and the lag target is now concurrent load, not residue.

**2026-07-28 16:19. PO direct observation, current build. Closes the one-monster-or-two question and redirects A.**

---

## 1. The PO's answer

**Single-chart replay feels the same before and after five multichart open/close cycles.** Asked and answered explicitly, on the correct comparison, after the first response was clarified.

**Therefore: the ~17 orphaned `M20Q6ReplaySystem` instances and ~15 leaked panel documents do NOT cause felt lag. They consume memory and nothing else.**

## 2. What this confirms

**Two separate defects, each with its own mechanism and its own fix:**

| Defect | Mechanism | Fix owner | What the PO will feel |
|---|---|---|---|
| **Memory** — unbounded retention, 4 → 17 engines, compiled code 45 → 137 MB | Orphans retained as keys in a strong `Map`; `fullData` never released | A, in flight | **Nothing.** Lower memory, identical responsiveness |
| **Lag** — ~50% slower with 4 panels open | Concurrent load; ~15.9 MB/s allocation churn and GC pressure on one main thread | **Unassigned** | The 50%, if reduced |

**My 16:07 prediction that A's teardown fix would not improve the 50% is confirmed in advance rather than discovered afterwards.** That is the one thing today I got ahead of instead of behind.

## 3. `FINDING-LAG-IS-RESIDUE-20260728.md` is CONTRADICTED and downgraded

**That document recorded a PO test result that lag was session-history dependent, and it shaped a great deal of today's thinking — the whole "orphaned processes left running after multichart teardown" line of reasoning descends from it.**

**It is now contradicted by direct PO observation on the current build.** If lag were residue, five cycles that demonstrably leave seventeen live engines behind would produce felt degradation. **They do not.**

**Downgraded from finding to unreproduced, not deleted.** The original observation was real when it was made. **Possible reconciliations, none verified:** the earlier session was far longer or had replay running during the cycles; the residue lag was incidentally fixed by intervening work between b75 and the current build; or the earlier observation attributed a concurrent effect to history. **Do not build on it further, and do not cite it as support for any remaining hypothesis.**

**This is the fifth premise today that did not survive contact with a direct measurement, and it is the most load-bearing one.** It is worth noting that every single one was corrected by a PO measurement rather than by reasoning.

## 4. The original complaint needs re-stating honestly

**The complaint that started this work was progressive lag during replay when drawings, orders or indicators are present.** Against today's evidence:

- **"Progressive" is not supported.** Single chart is unchanged after five cycles.
- **"With drawings, orders, indicators" is consistent with the churn mechanism** — all three raise per-tick allocation.
- **The concurrent 50% is measured and real.**

**So the defect is most likely "multichart replay is roughly half speed, worse with more per-tick work," not "the chart degrades over a session."** That is a different and more tractable problem, and it is the first time today the lag has had a target that is measured rather than inferred.

## 5. Dispatch — Manager A

1. **Continue the memory fix as top priority.** It is unbounded and it is real. **But report it as a memory fix only — no responsiveness claim, per §2. The PO already knows the 50% will not move, so an honest report costs nothing.**
2. **The residue hunt is CANCELLED.** Do not spend further time on orphaned timers, listeners or rAF loops as a *lag* mechanism. **They are a memory mechanism.** Anything already invested that bears on retention keeps its value.
3. **New lag target, replacing residue:** per-tick allocation and GC pressure with N panels open. **The measurement to start from is the 15.9 MB/s aggregate churn** — a Performance recording with four panels replaying, showing GC frequency and the top allocation sites. **This is now the lag work, and it is scoped to concurrent operation rather than session history.**
4. **SURF-1 and M25 stay below both of the above.**

## 6. M7 must be updated

**Two corrections to the known-limitations draft:**

- **The multichart ceiling is quantified: roughly 50% slower with four panels, PO-observed.** Replace any qualitative wording.
- **The memory fix must not be described as improving performance or responsiveness.** It reduces memory growth. **We have committed not to describe defects as fixed until verified on the deployed build; the same discipline applies to describing a fix as doing something it does not do.**
