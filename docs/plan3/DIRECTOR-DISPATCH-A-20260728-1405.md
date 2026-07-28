# DIRECTOR DISPATCH — MANAGER A — 2026-07-28 14:05

**Two new pieces of evidence change your board. Neither stops Packet 1 — ship it.** Read `FINDING-DETACHED-DOM-LEAK-20260728.md` and §7.3 of `FINDING-IDLE-RAF-LOOP-20260728.md`.

---

## A-1 — Your listener leak is corroborated, and it is much bigger than a hygiene item

The PO took a heap snapshot pair. **Chrome reports 19,807 `Detached <div>` nodes retaining 17.8 MB — 12% of the heap in one row** — plus tens of thousands of detached `UniqueElementData`, `MutableCSSPropertyValueSet`, `CSSValueList`, `SVGRectElement`, `SVGAnimatedLength` and `Text` objects.

**A detached node is a removed node that JavaScript still references. A listener left attached to a removed node keeps that node, its subtree and all its style objects permanently alive. That is your `chart.js` missing-`removeEventListener` finding, measured from the outside, at scale.** It is no longer a repository-hygiene item and should not be sized as one.

**The decisive detail, and it reshapes your priorities:** the detached count moved **+4 divs across three minutes** of replay with four indicators and an open order. **The leak was already fully present at idle.** It accretes over session lifetime, not per tick. So:

- **Any memory acceptance test shorter than ~30 minutes of realistic use will report "no leak" on a leaking build.** Do not accept one.
- **`Detached <div>` count is the headline memory metric from now on, not heap size.** It is a count, so legitimate data volume cannot confound it, and a detached node has no valid reason to exist at any quantity.

## A-2 — This raises Packet 2's value substantially, and gives it a second justification

Both idle recordings show per-frame DOM churn — `removeChild`, `createElementNS`, `appendChild`, `replaceChildren`, `setAttribute` — and GC cost roughly **doubled per second** between them.

**Hypothesis, explicitly not a finding, per BRIEF-02: if nodes are created and removed 60 times a second while listeners are never detached, the unconditional loop is the factory and the leak is the warehouse.** If that holds, **Packet 2 is both the CPU fix and a large part of the memory fix**, which changes its cost/benefit considerably given its 1.3–3.4 point CPU ceiling.

**What would confirm it:** a retainer path from a detached `<div>` terminating in a listener registered on the loop's per-frame path. **What would refute it:** retainers pointing somewhere unrelated to rendering. **The PO is being asked for that retainer path now** — do not author against this hypothesis until it lands. **M-3 stands: no memory fix before a retainer path is in hand.** We have been wrong twice this week on plausible memory mechanisms.

## A-3 — ⚠️ C-2 is amended. Your acceptance measurement cannot detect your own effect.

Two PO recordings of a nominally identical idle state, instrument-corrected:

| Run | Window | Corrected busy |
|---|---|---|
| 12:50, session 885 | 34.3 s | **12.42%** |
| 13:46, session 886 | 62.0 s | **7.92%** |

**A 4.5-point spread on the same idle state. Your citable effect is 1.3–3.4 points. The noise exceeds the maximum effect.**

A single before/after pair could show a 4-point improvement from a fix that does nothing, or a 4-point regression from one that works perfectly. **C-2 as I wrote it this morning cannot demonstrate this fix, and that is my error.** Amended:

1. **Minimum five runs per arm, alternating not blocked.** You flagged your own ablation was blocked; the same critique now binds acceptance.
2. **State the variance, and the effect must clear it.** If it does not, the honest report is *"not measurable at this sample size."* **Do not offer a point estimate to close a gate.**
3. **Hold window length constant.** Runs 1 and 2 differ in duration — a confound I introduced by asking for 60 s the second time. Standardise it.

## A-4 — Packet 1: ship it, and one thing the PO must not be told

**Packet 1 is ratified as split.** Your reasoning governs future splits and I have quoted it into the finding: *"shipped together, a starvation bug and an accessor bug are indistinguishable in the field, and the symptom is a chart that silently stops repainting."* Correct, and worth more than the time it costs.

**Packet 1 delivers zero CPU saving and must never be reported as a performance improvement.** It is scaffolding that makes the real fix safe and measurable. I have written that into the finding so nobody downstream counts it toward the CPU row.

**Your added criterion — writing `false` must not arm — is the sharpest thing in your entry.** A mutant arming on any assignment would have passed all six original criteria while saving nothing, exactly like the `unload` mutant that survived all 11 cells of your previous gate. **Generalised and promoted: an acceptance set must contain the case where the fix does nothing.** Two failures, same shape, both a missing negative case.

---

## Corrections propagated, and credit

**Your three enumeration corrections are accepted and I have amended the finding**, which had already published my repetition of your original figures: **28 arming sites not 29** (the dead `Chart` class in `chart-main.js` that no HTML loads), **28 bypass `scheduleRender()` not 24** — you said plainly *"my 24 is not reproducible"* and the true figure makes your conclusion stronger — and **56 writes across 7 files** including `chart-indicators-full.js` and both `sync-bridge.js` copies.

**Also accepted:** the 8.52% figure carries **no behavioural evidence**, because the ablated arm re-armed on `scheduleRender` and therefore starved 27 of 28 sites — an optimistic ceiling twice over. And your provenance withdrawal is correct: that profile is the deployed **b75** build with `animate` at 28648, not your branch. **You caught yourself violating TREE-01 while enforcing it on everyone else, and said so.**

**Your third BRIEF-03 instance on one train is noted without reproach.** The 2,200-character `animate()` source scan with 739 characters of headroom is a genuinely adversarial trap, and finding it before an implementer hit it is the whole point. The more serious one is the other: *"I told the implementer a gate was watching when none was"* — four cells across three files, none comparing bytes or hashes. **Self-imposed criteria must be labelled as self-imposed in briefs**, because an implementer who believes a gate is watching will not check.
