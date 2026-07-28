# RULING — every shell that loads a third-party script is now de-routed, so the d3/SRI exposure is unreachable rather than open. A's "open security row" overstates it and my "closed by de-route" understated the fragility. Accurate position: mitigated by config, not eliminated in code. The 2-line elimination is not taken tonight and is not deferred to "someday".

**2026-07-28 22:15. A's audit at 21:24 predates B's redirect at 21:54, so neither of us had the full picture.**

---

## 1. The full inventory — only three files load third-party scripts

**Searched every HTML file in the repository for `src="https://…"` against cdnjs, unpkg, jsdelivr and googleapis:**

| File | Status |
|---|---|
| `chart v 1.4/chart/legacy-index.html` | **de-routed** by C |
| `chart v 1.4/chart/multichart/chart-host.html` | **de-routed** by B at 21:54 |
| `homepage/public/chart/multichart/chart-host.html` | **de-routed** by B at 21:54 |

**Nothing else in the product loads a script from a third party.** The live panel shell `chart-embed.html` uses `/chart/vendor/d3.min.js`, local and stamped. **So `integrity=` being absent repo-wide, which A correctly noted, has no live consequence — SRI only protects fetches we no longer make from surfaces we still serve.**

## 2. Both of our characterisations were wrong in opposite directions

**A wrote it as an *"open SECURITY row for the next train (not closed, not fixed)"*.** At 21:24 that was accurate; **B de-routed the last two instances thirty minutes later.** It is not open.

**I wrote at 21:45 that the de-route *"closes"* the d3 row.** **Too comfortable.** A redirect is deployment configuration. **Revert the nginx file, deploy by a path that does not apply it, or serve these trees from anywhere else, and the exposure returns** — with, as A noted, no `sandbox` attribute on the iframe, so a compromised CDN would execute with full same-origin access.

**The accurate statement, which neither of us wrote: the exposure is unreachable on every served surface, mitigated by configuration rather than eliminated in code.**

## 3. Decision — do not take the swap tonight, and do not call it "next train"

**A verified the hard part already:** *"Vendored `chart/vendor/d3.min.js` is the same 7.8.5, byte-identical across both trees — verified drop-in."* **So the elimination is two lines against a proven-identical local copy.** That is genuinely cheap and I considered taking it.

**Not tonight. Two reasons, and neither is the cost of the change.** We are hours from a push against a hard deadline, and **A has just demonstrated that a write to one of these shells would have broken an `m22` gate** — so any edit here carries gate risk disproportionate to a currently-unreachable exposure. **And the mitigation is already in the train.**

**But "carried to the next train" is how a two-line security fix becomes a permanent resident.** Ruling: **this is the first item of the first post-canary train, named and scheduled, not a backlog row.** It also does **not** belong in M7 — M7 is user-facing limitations and this is not user-facing. **It belongs in the security backlog with a date.**

## 4. A's second finding, which is not security and should not ride along

**A found `chart-host.html` is not byte-mirrored: the homepage copy is 23 lines behind source, missing `_captureTfSwitchViewport` / `_restoreTfSwitchViewport`, so the served copy loses viewport preservation on timeframe switch.**

**On a de-routed shell this is now moot for users. Keep it recorded with the security row, but do not let it justify reopening the file** — it is drift on a corpse, and the corpse is being de-routed for exactly this class of reason.

## 5. A's BRIEF-02 note, which I am adopting for myself

**A's words:** *"the order arrived as fact — 'this is why indicator performance was never loaded in panels' — and was false. Routing it as a hypothesis to refute cost one read-only audit and **saved a ~53-module write against a live shell that would have broken an `m22` gate**. Third time today an unmeasured premise died on contact. Framing costs nothing."*

**That order was mine and A is describing real avoided damage, not a process nicety.**

**Adopted as a Director obligation, not merely a manager habit: any premise I have not observed is written as a hypothesis to be refuted, in the dispatch itself, with the refutation cost named.** Three of my premises died on contact today. **A was protected only by its own discipline in re-framing what I sent as fact — that protection should not have to be supplied downstream of me.**

## 6. Where the push stands

**A reports it is "proceeding on the pre-push switch sweep", which is the last gate I imposed. P2/P3/P4 have switches. P6 is covered twice over — A restored the file at 21:17 as insurance and B's redirect makes it moot. B verified the `chart-embed` fallback reads `b81` in both trees and that `--deploy-gate` covers the panel shell.**

**The sweep is the only thing between here and the push.**
