# RULING — The bar-store falsification **did not run**. `chart.js:3194` reads `window.__TALARIA_DISABLE_SHARED_BAR_STORE` from the **local** realm; the PO set it on the top window, and panels are separate realms where it was `undefined`. **The store stayed enabled in every panel.** The hypothesis is neither confirmed nor refuted — **the instruction was mine and it was wrong.** Consequence: the deferred realm-propagation mechanism is no longer a convenience, it **blocks acceptance testing of all five shots**, and is promoted to Shot 0. PO has also ruled the leak a **canary blocker, not a disclosure item**, and authorised the production trade-loss fix.

**2026-07-29 03:50. PO: "I have set it before both tests." So the test ran, the flag was set, and it reached nothing.**

---

## 1. Why the test could not have worked

**Line 3194 is `if (window.__TALARIA_DISABLE_SHARED_BAR_STORE) return null;` — evaluated inside whichever realm calls it.**

**The PO set the flag in the top window's console. Each panel iframe has its own `window`.** **Inside a panel, that property was never defined, so `_sharedBarStore()` proceeded normally and every panel kept using the store.** **The +52/+46/+52 growth was measured on an unmodified product.**

**I wrote that instruction, described it as a five-minute falsification, and told the PO it could refute my own theory. It could not have done either.** **This is the same defect class I have been prosecuting all night — a control that does not reach the surface it claims to control — and I shipped one into the PO's hands.**

**The bar-store hypothesis returns to unresolved. It is not strengthened by surviving a test that never touched it.**

## 2. The consequence that reorders the work

**Every one of the five shots is switched by a flag read inside a panel realm. None of those switches will reach panels either.** **So "with the switch set it retains, with it clear it releases" — the acceptance shape I specified for all five — cannot be executed at all.**

**The generic realm-propagation mechanism was deferred to top-tier review as infrastructure. It is not infrastructure. It is the thing standing between us and grading any panel-scoped fix**, and it has now silently invalidated a PO measurement. **Promoted to Shot 0, ahead of the five.**

**Note the irony I should have seen at 00:00: I wrote `CORRECTION-D8-HOLLOW-GRANT` specifically because gating FIX 1 on the realm mechanism chained it to a blocker.** The workaround there was to have FIX 1 read its flag through the parent window. **That workaround is exactly what the other five shots now need, and I did not generalise it.**

## 3. PO rulings received

**The leak is a canary blocker.** *"Canaries must test on a chart that never leaks."* **This overturns my 02:55 position that ~50 MB per cycle was disclosable and survivable.** It is not to be disclosed; it is to be fixed. **Canary does not open on a leaking build.**

**The production trade-loss fix is authorised.** *"Yes for the trade loss, fix the problem."* **B ships the scoped `api_server.py` change to production.** Restore point first, verify in the same session, journal before execute. **This is the only production write authorised; nothing else travels with it.**

## 4. Falsification moves to C, not back to the PO

**The PO has ended manual testing and that is respected.** **C's instrument runs the bar-store falsification correctly, because a browser harness can set the flag per-realm before each panel boots — which a human with one console cannot.**

**Until that runs, shots 1-3 stay motivated by the retainer capture rather than proven by it.** **The capture remains the only direct evidence we have: a live top-window global reaching a Detached Window through `clearFile()`'s closure. That was measured, and it stands.**

## 5. Standing lesson

**Recorded as `FLAG-03`: a kill-switch read inside an iframe realm is not settable from the parent's console, and any test instruction that assumes otherwise is measuring the unmodified product.** **Before a switch is offered to anyone — PO, manager or gate — the realm in which it is read must be named, and the mechanism that reaches that realm must exist.**

**This is `FLAG-01` and `FLAG-02` extended along the axis I missed. Those asked whether a switch could be tested absent and flipped without reload. Neither asked whether it could be reached at all.**
