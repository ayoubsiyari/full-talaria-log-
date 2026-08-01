# RULING — Memory fix disposition. Merge it, claim nothing, and let C's browser runner be the demonstration. Do not rebuild A's harness.

**2026-07-28 16:39. Answers A's escalation: the orphan-release fix is code-correct but has no demonstrated effect because A's harness cannot reproduce the leak.**

**None of A's three options is right. The answer is a fourth.**

---

## 1. Ruling

**MERGE the fix. Label it "code-correct, effect not demonstrated." Do NOT rebuild A's harness. The demonstration is C's M-6 gate on the live browser runner, which is already in flight and built for exactly this.**

## 2. Why not "hold for the PO's reading"

**Because the PO's reading is the *final* confirmation, not the *first* one, and using it as the first would mean the PO is once again our only working instrument.** They have hand-run four rounds of heap snapshots today and have told us plainly they are out of patience with it. **Holding a correct fix hostage to a fifth manual round is the exact pattern they objected to.**

**It also blocks the release train on a human being's availability**, which under a 3–4 hour standby canary is a scheduling risk we do not need to take.

## 3. Why not "rebuild the harness first"

**Because A's harness is the wrong instrument and rebuilding it duplicates work already assigned to C.**

**A's harness doubt is deeper than this one packet and A raised it first:** a 33 MiB JS heap reported for a workload that produced multi-gigabyte working sets, with A explicitly refusing to guess whether the build improved fivefold or *"the harness is measuring a smaller scenario than the one that produced the original numbers."*

**This packet answers that question. The harness cannot reproduce a leak that the PO reproduced in ten minutes by hand — 4 → 17 engines across five cycles. So the harness is measuring a smaller scenario. A's doubt is confirmed.**

**That is a finding, not an obstacle.** But the remedy is not A rebuilding a Node harness to simulate a browser; it is **C's live browser runner**, which already exists, already has real acceptance, and is already dispatched to build the M-6 leak gate. **Two managers building two instruments for one measurement is exactly the waste the PO is angry about.**

## 4. Why "merge on hygiene grounds" is right, but the wording is not

**Merge, yes. "Hygiene grounds" understates it and I will not have it recorded that way.**

**The leak is not hypothetical and the fix is not speculative.** The PO's snapshots establish the count going 4 → 17 unbounded, roughly 7.5 MB retained per orphan, ~15 leaked panel documents, compiled code from 45 MB to 137 MB, and the retaining edge named in the heap as the instance being a key in a strong `Map`. **The mechanism is identified, the fix addresses that identified mechanism, and it is code-correct on review.**

**What is missing is not confidence in the fix. It is an instrument capable of observing the effect.** Those are different deficiencies and conflating them is how a real fix gets discarded as unproven.

**So: merge, and record precisely what is and is not established.** Per `VER` discipline and `EVID-01`, the packet's evidence must state that no behavioural demonstration exists yet and name C's M-6 gate as the pending demonstration. **A must not report this as a fixed leak** — the same rule that forbids describing defects as fixed until verified on the deployed build applies to describing them as fixed before any instrument has seen it.

## 5. Sequence, so nobody waits on anybody

1. **A merges now**, labelled as above, with kill-switch. **A does not wait for C.**
2. **C's M-6 gate demonstrates it** — engine count exactly 1 in a single-chart state after cycles, detached nodes not grown. **Per C's own W55 precedent the mutant must be a real fix-reversal: a gate that passes with the teardown reverted is worth nothing, and that is doubly true here, where the gate is the sole evidence the fix works.**
3. **The PO confirms on the handed-back build**, as already committed — one heap reading, not a new test round.

**If C's gate shows the fix does not work, we find out from the gate rather than from the PO, which is the entire point of building it.**

## 6. The systemic item, recorded because it will outlive this packet

**Our only instrument that reliably reproduced any of today's defects was the PO taking DevTools snapshots by hand.** The trade-loss path, the unbounded leak, the compiled-code growth, the 50% concurrent lag, the flat-versus-growing detached divs — **every one was established or corrected by a PO measurement, and A's harness reproduced none of them.**

**That is the deepest finding of the day and it is not A's fault.** It means our automated test estate exercises a scenario materially smaller than production. **C's browser runner and the 4-panel replay benchmark are the beginning of the fix; the full remedy is past canary and belongs in the backlog with an owner.**
