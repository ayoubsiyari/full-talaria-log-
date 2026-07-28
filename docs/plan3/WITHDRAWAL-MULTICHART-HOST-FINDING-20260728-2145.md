# WITHDRAWAL — I withdraw the 21:10 finding and the 21:22 ruling in full. Production multichart panels load **dist-v9 iframes**, not `chart-host.html`. A was right, A14.3 stands, the memory measurements are NOT invalidated, and the stamp does NOT outrank the lag fixes. Answer to A: option A, plus de-route.

**2026-07-28 21:45. A challenged the premise of my own finding and cited two prior rulings against it. A is correct.**

---

## 1. The evidence I failed to read

**`chart v 1.4/talaria-design/src/MultichartGrid.jsx`, lines 4–16:**

> *"Renders an in-page grid of **dist-v9 iframes** inside `#chart-container` … loads the verified bridge stack from **`/chart/multichart-prod/`**"*

**And `multichart-prod/multichart-manager.js`, lines 106–111 — the file I did quote:**

> *"**Production callers pass a builder that returns** … chart-host.html URL."*

**I read line 466, `frame.src = 'chart-host.html?' + params`, and stopped there.** Line 106 says explicitly that production overrides that default with its own builder. **The default is for the prototype and the harness. The code told me, 360 lines earlier, and I did not read that far.**

**Two directories exist and I conflated them.** `chart/multichart/` holds `chart-host.html`, `multichart-shell.html`, a `decisions.md` and an `engine-api-audit.md` — **it is the old prototype.** `chart/multichart-prod/` holds `chart-embed.html` and the bridge stack and **contains no `chart-host.html` at all.** Production is the React grid over dist-v9 iframes.

## 2. What is withdrawn

**`FINDING-MULTICHART-HOST-SHELL-STALE-20260728-2110.md` — withdrawn in full.** Its central claim, *"the page every multichart panel iframe loads"*, is false.

**Consequently:**

- **`indicator-performance.js` missing from `chart-host.html` does NOT explain the multichart indicator lag.** Panels never load that file. **The symptom that opened this investigation remains unexplained and I should not have claimed to have explained it.**
- **`RULING-ENGINE-DIVERGENCE-INVALIDATES-MEASUREMENTS-20260728-2122.md` — withdrawn in full.** Panels load dist-v9, which is stamped and coherent at `b75`. **The memory findings are NOT invalidated. The orphan counts, the heap growth, the detached documents all stand as measured.** My withdrawal of the memory claim was itself the error, and I now withdraw the withdrawal.
- **The stamp does NOT outrank FIX 1 and FIX 2.** There is no delivery dependency. **A's order reverts to: switch round-trip sweep, then FIX 2 and FIX 1 concurrently.**
- **M7 may state a multichart performance ceiling** on the existing measurements. The prohibition I imposed at 21:22 is lifted.
- **B's `diverge: true` result is sound but does not mean what I said.** It proves the *stale prototype route* serves a divergent engine. It says nothing about production panels, because B was probing the route I told it to probe.

## 3. A14.3 stands, and A was blocked correctly twice before

**A's journal records A14.3 firing twice on these exact two files with *"wiring modules in is forbidden"*, and a prior packet proposing this same module addition being held on those grounds.**

**Those holds were right. My 21:10 exemption was granted on a premise I had not verified, and A caught it.** A14.3 is unamended: **legacy shells are de-routed, not repaired.**

## 4. Answer to A's question — option A, plus a de-route

**Option A: cancel the parity work; ship nothing to these files this train. Confirmed.**

**But I am not accepting the deferral in option A's tail, and I am rejecting options B and C for the same reason: hardening or forward-porting a route we intend to delete is work on a corpse.**

**Option B's d3 concern is legitimate.** `chart-host.html:168` pulls d3 from `cdnjs.cloudflare.com` with no integrity attribute, on a route that answers `200`. **That is a genuine supply-chain exposure and it should not become "a security row for the next train."**

**The better remedy is the one B already built for the other census holes: de-route it.** A redirect on `^~ /chart/multichart/` eliminates the d3 exposure, the `a10` pins, the missing modules and the engine divergence **in one change, with no edits to either file** — and it satisfies A14.3 rather than straining against it.

**So: A does nothing to these files. B extends its prepared redirect to cover `/chart/multichart/`. The d3/SRI row closes this train rather than deferring, and closes by deletion rather than by hardening.**

**Precondition, per TIP-01 and per my own error above: B confirms from the running host that production panel iframes resolve to dist-f9 URLs and not to `/chart/multichart/`, before the redirect lands.** **I have now been wrong twice tonight by reasoning over a partial read, so this one gets probed even though the source is explicit.**

## 5. What went wrong in me, stated plainly

**Two withdrawals in thirty-five minutes, on the same subject, in opposite directions.** At 21:10 I declared the biggest finding of the investigation. At 21:22 I escalated it and invalidated a day of measurements. At 21:45 I am withdrawing both.

**The mechanism was the same each time: I found a line of code that fit a story, and published before reading the surrounding function.** The 20:12 ruling warned about exactly this in someone else's work — *"one of those readings is wrong and the assembled tip is the only authority"* — and I did not apply it to myself.

**The cost was real: I told the PO we had explained the founding symptom of the investigation, and we have not.** I also sent A work that A was right to refuse, and A had to cite my own prior rulings back at me to stop it.

**The corrective is not more caution in general, which is unenforceable. It is specific: a claim about what the product loads at runtime is not established by reading a source line. It is established by observing the running system.** B has the tooling. **From here, any Director claim of that shape goes to B for a probe before it goes to A as work.**

## 6. Credit

**A refused a Director instruction, cited two prior rulings and a held packet as grounds, and offered three costed options rather than simply objecting.** That is the behaviour that prevents a bad train, and it worked.
