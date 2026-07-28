# RULING — Ship on the 12. The ~145 pre-existing switches are out of this train's scope and their audit is deferred. But D is correct that it identified the higher-value question, and it is promoted above any further sweeping: a switch that does not reach the panel iframe realm is not a revert for the two fixes whose entire purpose is inside panels.

**2026-07-28 23:05. Answering A's escalation on switch-sweep scope. A's boundary was drawn correctly and A's default is upheld, with one addition that costs far less than option B and protects far more.**

---

## 1. Ship on the 12 — option A upheld

**A swept the 9 switches this train adds plus the 3 pre-existing ones the diff touches. That is the correct boundary and I want the reasoning on the record, because "157 flags exist and we checked 12" reads badly out of context.**

**The purpose of the sweep is rollback insurance for the changes we are shipping tonight.** A switch guarding a feature this train does not touch is not insurance for this train — **if it is stranded, it was stranded yesterday and it will be stranded tomorrow, and holding the push does not un-strand it.** It is a pre-existing latent defect, correctly named as such, and it did not enter with our diff.

**Option C is rejected.** Sweeping 157 before the push spends the hours the PO has assigned to the lag fixes on auditing switches for features we are not changing. **The PO ruled the multichart lag into canary scope; switch archaeology did not make that list.**

**Option B is deferred, not rejected.** A's cheap static triage of the three stranding shapes across the remaining ~145 is genuinely good work and **Q6 proves the population carries the defect class, so this is real rather than theoretical.** It goes to the post-canary train, alongside the d3 vendored swap.

## 2. But option D found the thing that actually matters, and it is promoted

**A's D option — *"the per-realm revert mechanism outranks more sweeping"* — is right, and it outranks B, C, and any extension of the sweep.**

**Here is the sharp version.** Multichart panels are **separate iframe documents with their own `window`.** Setting `window.__TALARIA_DISABLE_X = true` in the host **does not set it in a panel's realm.** So a switch can round-trip perfectly in the host and revert nothing where the code actually runs.

**And the two fixes with the highest risk and the greatest PO attention — FIX 1 (background-panel render cadence) and FIX 2 (per-tick allocation reuse) — execute inside panels.** **A sweep that proves all 157 switches work in the host, while none of them reach the panel realm, would give us exactly zero rollback capability for the two changes most likely to need it.**

**This also engages `FLAG-02` directly.** If reaching the panel realm requires reloading each panel, the switch is not a kill-switch by our own standing definition.

## 3. Required, and it is small

**For every switch guarding code that executes inside panel iframes — FIX 1, FIX 2, and any render switch in this train — demonstrate a single-action revert that reaches all panels without reloading them.**

**Mechanism is A's choice.** A host-to-panel `postMessage` broadcast, panels reading through `window.parent`, or any other route A prefers. **The acceptance is behavioural, not structural: flip once in the host, observe the behaviour change in all four panels, flip back, observe it return.** Per `GATE-01`, show it failing first — demonstrate that the naive host-only assignment does *not* propagate, then that the mechanism does.

**Ownership split, since D proposed settling this with B: the mechanism is A's code and A's call. B verifies it on the deployed host after the push.** A does not need to negotiate the design with B; A needs B to confirm it survives deployment.

## 4. One operational note for the canary runbook

**Because ~145 switches remain unswept and the defect class is proven present, the runbook needs one line:** if an operator flips a pre-existing switch during canary and nothing changes, **that is a known class of defect and must be escalated rather than interpreted as evidence that the underlying fix failed or that the feature is unaffected.** Without that line, a stranded switch will be silently misread as a diagnosis.

## 5. Order of work for A, unchanged apart from the insertion

**Panel-realm revert demonstration, then FIX 2 and FIX 1 concurrently.** The realm work is a precondition for the lag fixes having usable switches, so it is not a detour — **it is the thing that makes the next four hours revertible.**
