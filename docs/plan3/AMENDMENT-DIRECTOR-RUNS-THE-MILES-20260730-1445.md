# AMENDMENT — The Director runs the miles. No decision gates. Hard checkpoints instead.

**Date:** 2026-07-30 14:45
**Amends:** `COMMITMENT-CANARY-SATURDAY-1800-20260730-1440.md` §3, §4
**Status:** binding. Supersedes the Friday 02:00 and Friday 18:00 PO gates.

---

## 1. PO instruction, verbatim

> No no — you run the whole miles, you keep grinding it, you do not stop for my
> decision. You create a hard checkpoint before the riskiest step, and when you finish
> it you call me to test. I already gave the approval.

The approval is standing. Two gates I wrote into §4 are struck: the Friday 02:00
smoothness check and the Friday 18:00 trajectory go/no-go. Neither was a decision the
PO needed to make; both were me routing my own risk to the PO's desk.

---

## 2. `AUTH-01` (new, binding)

> The PO's approval for the canary landing sequence is standing and does not need
> re-confirming per step. The Director proceeds through the sequence without pausing
> for a decision. The Director's judgement calls are the Director's to make and to be
> accountable for.
>
> The PO is contacted for exactly two reasons: **something is ready to test**, or
> **the bar in §2 of the Commitment cannot be met and the PO's product decision is
> genuinely required.** Progress reports are not a reason. Reassurance is not a reason.
> Asking permission to do something already approved is not a reason.

The Friday 18:00 trajectory call still happens — but as a **written report the PO can
read when convenient**, not a meeting that blocks the pipeline. I keep grinding either
side of it.

---

## 3. `CKPT-01` (new, binding) — what a hard checkpoint has to be

A checkpoint is not a commit message and not an intention. Before any risky landing,
all four of these exist or the landing does not start:

1. **An annotated tag on the exact train tip**, `ckpt/pre-<landing>-<buildid>`,
   recording the build ID and commit read from the running page (`MEAS-01`).
2. **A retained, deployable artifact** of the last-known-good build. Rollback is a
   redeploy of bytes that already ran, never a rebuild from source. A rebuild is a new
   risk, not a retreat from one.
3. **A kill-switch on the landing itself**, satisfying `FLAG-01` (tested against the
   ABSENT property), `FLAG-02` (flippable without reload), `FLAG-03` (verified in the
   OFF state against a working-product assertion, not merely "feature inactive").
4. **An exercised rollback.** The rollback path is executed and verified *while the
   system is still green*, before the risky landing goes in.

Point 4 is the one that is usually skipped and it is the one that matters. This is
`GATE-01` applied to retreat: a rollback you have not run is not a rollback, it is a
hope. We learned this the expensive way with the PURGE-2 flag, where the kill-switch
turned out to revert a bug fix nobody knew had shipped, and with the b85 displacement,
where the live wire moved under a measurement.

**Checkpoint required before, at minimum:** A's Landing A1 (base-series residency),
A's Landing A2 (compact bar storage), and the final freeze assembly. Any manager may
declare their own step risky and take a checkpoint without asking.

---

## 4. Revised schedule — PO contact points only

Everything else runs continuously and unattended.

| When | What | PO |
|---|---|---|
| Thu 20:00 | CONF-01 reference baseline published | — |
| Thu 22:00 | **CKPT-01 taken and rollback exercised** before A1 | — |
| Thu 23:00 | A1 lands, oracle-gated | — |
| Fri 02:00 | A1 deployed, C grades it. Director judges alone. | — |
| Fri 04:00–06:00 | First 2-hour duration run | — |
| Fri 06:00 | **CKPT-01 taken and rollback exercised** before A2 | — |
| Fri 08:00 | A2 lands if A1 graded clean. Director's call. | — |
| Fri 12:00 | Second duration run | — |
| Fri 18:00 | Trajectory report **written**, PO reads at leisure | read only |
| Fri 20:00–Sat 04:00 | Remaining hit-list cuts, third and fourth duration runs | — |
| Sat 04:00 | **CKPT-01 on the freeze assembly, rollback exercised** | — |
| Sat 06:00 | **Code freeze.** | — |
| **Sat 06:00–14:00** | **Call to test.** D's five scripts, CONF-01 staged. | **~4 hrs** |
| Sat 14:00–18:00 | Deploy, smoke, build-stamp verify, canary opens | brief |

**One PO contact point before Saturday morning: none.** If the bar in Commitment §2
becomes unreachable, that is the one interrupt, and it comes with numbers and options.

---

## 5. What the Director now decides alone

Previously routed to the PO, now mine:

- whether A1 graded clean enough to proceed to A2
- whether a landing rolls back or holds
- whether a duration run's slope is flat or climbing
- whether a suspect is dead
- resequencing when a landing slips
- what ships in the freeze assembly

Two things remain outside the Director's authority and always will:

- **Price correctness.** The parity oracle's verdict is final. No schedule pressure
  overrides a divergent bar.
- **Money path.** Order and trade behaviour ships on top-tier review, or not at all.

And one rule holds against me: `DECL-01`. I still do not get to declare a defect dead
by reasoning. An instrument does, or the PO's eyes do. Standing authority to *act*
without asking is not authority to *conclude* without measuring.
