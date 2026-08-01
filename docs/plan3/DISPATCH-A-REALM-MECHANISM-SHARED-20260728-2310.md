# DISPATCH A — Ratifying the concurrent dispatch and the cheap-tier triage, which improved on my ruling. One coordination hazard to close before both subagents build: FIX 2's switch is read inside the panel realm but the propagation mechanism must live in FIX 1's file, so the per-realm requirement as written cannot be satisfied independently by both briefs.

**2026-07-28 23:10. Also recording that I checked A's inverted-default note against the source and found the product clean — my suspicion was wrong and A's negative controls are the reason it looked otherwise.**

---

## 1. Ratified, and one improvement over my own ruling

**I ruled option B deferred to post-canary. A instead routed it to cheap tier in parallel, with the brief forbidding the subagent from issuing verdicts — it produces suspicion with evidence and confirmation happens downstream.** That gets the audit at approximately zero cost to the critical path, which is better than my answer. **Adopted.**

**The four stranding shapes are a genuine contribution and I want them named in the standing record rather than only in A's journal:** init-time sampling with per-call consumers; self-uninstalling wrapper; terminal-state stranding; dead guard via shadowed override or unloaded module. **All four observed in this codebase today, which is what makes the deferred audit real work rather than hygiene.**

## 2. I checked the inverted-default note and the product is clean

**A's note that "production has these properties absent and a `!== false` default is inverted relative to every other switch" read to me as a report of a live defect, and I went looking before saying so.**

**Product code, both trees:**

```
chart-indicators-full.js:113   window.__TALARIA_DISABLE_INDICATOR_PERF_BRIDGE_V1 === true
module-presence-runtime.js:14  window.__TALARIA_DISABLE_MODULE_PRESENCE_TRIPWIRE_V1 === true
```

**Both `=== true`, so absent means not disabled, so the feature is on by default. Correct, and 129 of the tree's switch reads use that form.**

**The only two `!== false` occurrences in the tree are inside `r3-loadtime-killswitches.test.mjs`, as deliberate fault injections** — A mutates the source to the inverted form and asserts the oracle throws. **That is `GATE-01` executed properly: the gate is demonstrated RED against a faithful reversal before it is trusted GREEN.**

**So A was describing a shape its scan looks for, not a defect it found, and the thing that made it look like a live defect was A's own negative controls.** Recording this because it is the fourth time tonight a phrase in a report matched a defect pattern I recognised, and the first time I read the source before publishing. **The other three cost A real hours.**

## 3. The hazard — the per-realm requirement cannot be satisfied twice independently

**A's dispatch puts the per-realm requirement into both briefs as non-negotiable acceptance, with FIX 2 owning `replay-system.js` and FIX 1 owning `chart.js` plus `multichart-manager.js`, each forbidden from the other's file.**

**Those two constraints collide.**

**`replay-system.js` executes inside each panel iframe, so FIX 2's switch `__TALARIA_DISABLE_REPLAY_TICK_ALLOC_REUSE_V1` is read in the panel realm.** For a single host-side flip to reach it, **something on the host must propagate into the panels — and the host side of panel lifecycle is `multichart-manager.js`, which is FIX 1's territory and explicitly forbidden to FIX 2.**

**So FIX 2 can satisfy its per-realm acceptance only by writing FIX 1's file, which violates its own brief, or by inventing a second propagation route, which leaves us with two mechanisms for one requirement.**

## 4. Required — one shared mechanism, built once, consumed by both

**Build the realm propagation as a single mechanism owned by whichever brief holds `multichart-manager.js`, expose it as a generic route rather than per-switch plumbing, and have both fixes consume it.**

**Generic means the mechanism carries any switch name, so FIX 2 registers its flag without touching the host file, and the ~145 deferred switches inherit the capability for free when their audit lands.**

**Acceptance is unchanged and stays behavioural per `GATE-01`: demonstrate that a naive host-only assignment does not propagate, then that one flip changes behaviour in all four panels and one flip back restores it, without reloading any panel.** `FLAG-02` is the binding constraint.

**If this pushes the two fixes back into partial serialisation, take it** — one propagation route that provably works is worth more than two fixes with switches we cannot trust, **and per tonight's ruling the switches are the only thing that makes the next four hours revertible.**
