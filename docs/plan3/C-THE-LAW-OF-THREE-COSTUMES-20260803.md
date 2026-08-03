# One law, three failure modes — and a second class beside it

**C, 2026-08-03 22:55+01:00.** Written down as one thing because it turned up three times in one day
wearing different clothes, and I treated each as its own lesson until the Director pointed out they
were not.

---

## THE LAW

> **A thing can exist, be reachable, and still not be in force. Every claim that something is working
> must name WHICH of those it has actually observed.**
>
> Presence is not binding. Binding is not correctness. **Committed is not the same as written.**

The first two are BIND-01, which we have had all along. The third is new today and belongs with them:
it is the same distinction applied to the tree rather than to the call graph.

### The three failure modes, each with today's instance

| # | mode | what it looks like | today |
|---|---|---|---|
| 1 | **PRESENT_BUT_UNBOUND** | the implementation exists; nothing calls it | ABBA drift control: written, tested, never called |
| 2 | **BOUND_BUT_WRONG_NAME** | a real caller exists, but the gate names a different symbol, so the audit reports it unbound | `COV-01-BASIS` named `coverageAcrossProcesses` while callers used `captureDetailedDump`; `PHASE-SURVIVAL-01` named `assessSurvival` while the sweep used the entry point |
| 3 | **BOUND_BUT_UNCOMMITTED** | the binding is written and works on this machine; it is absent from the tree that gets built | `SETTLE-CRITERION-V2` read `SELF_TEST_ONLY` while its binding sat uncommitted |

### Why they must stay distinct

They send you to three different places. Mode 1 needs the work doing. Mode 2 needs one line of the
manifest changed. Mode 3 needs `git commit`. Collapsed into a single red, all three read as "go and
write the gate", which is the wrong instruction for two of them — and in mode 2's case it sent me
looking for a caller that already existed.

**All three also fail in the safe-looking direction.** Modes 2 and 3 report a working gate as broken.
A false red is as dangerous as a false green, because a lane that learns to discount its own audit has
no audit.

### What each mode now costs to detect

- Mode 1: `gate-binding-audit` — `SELF_TEST_ONLY`.
- Mode 2: still **manual**. The audit cannot know that a gate names the wrong symbol; a symbol with no
  callers and a symbol with the wrong name look identical from inside. **This is the open one.** The
  partial mitigation is that the manifest should always name the *entry point a caller would import*,
  never an inner helper — stated here so the next entry follows it.
- Mode 3: `BOUND_BUT_UNCOMMITTED`, added today. It required `git grep --untracked`: a caller in a
  brand-new file is the commonest form of not-yet-committed, and plain `git grep` structurally cannot
  see it. Without that flag the new state would have been correct-but-inert — mode 1 of itself.

---

## THE SECOND CLASS: CROSS-BASIS BORROWING

Not the same law. Its own class, found twice today.

> **Taking a figure measured on one quantity, scope or method and using it against another, where the
> arithmetic is valid and the meaning is not.**

| instance | the borrow | what it cost |
|---|---|---|
| COV-01 read 59.84% | ONE renderer's roots over ALL processes' private memory | blocked the 674.9 MB floor for a day of scheduling |
| PHASE-SURVIVAL-01 | the JS-heap sawtooth (183.4 MB) applied to GPU canvas memory | nearly killed three canvas reclaims that are merely ungraded |

Both times every input number was correct. **MB is not a basis.** A basis is *quantity, over what
scope, measured how* — and two figures may only be combined when all three match.

### The check, not the vigilance

`scripts/lib/basis-guard.mjs`. Figures carry a basis; `ratio()` and `difference()` refuse across a
boundary and return no number rather than a plausible one. Quantity, scope and method are checked
separately, because they are different mistakes. An **untagged** figure is refused outright — the
whole failure mode is that everything looks like a plain number.

Borrowing is still possible, because sometimes it is right: `borrowAcrossBasis()` permits it with a
written justification of at least 40 characters that lands in the artifact. Same rule as
`KNOWN-WEAKNESS-01` — a hollow disposition buys nothing.

Bound into `coverageAcrossProcesses`, which is where the 59.84% came from. If a future edit narrows
the numerator back to one process, the ratio now refuses instead of producing another believable
percentage.

---

## The pattern behind both

My characteristic failure was named earlier today as treating my own prior output as settled context
rather than as evidence to re-query. These two are its structural cousins: **a fact established in one
frame, carried into another where it no longer holds** — a caller that exists in my editor but not in
HEAD, a percentage true of one process quoted over all of them. In each case nothing was wrong when it
was written down. It stopped being true when it moved.
