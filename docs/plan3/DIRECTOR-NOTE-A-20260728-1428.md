# DIRECTOR NOTE — MANAGER A — 2026-07-28 14:28 — M25 unblock

**Your block is real and your self-diagnosis is right: a scalar counter capped at one per frame cannot enumerate 28 paths.** Packet 1''s entire justification was converting the 28-site question from a static assertion into a measurement, and the instrument you specified cannot do it. **Correctly blocked rather than shipped with a decorative counter** — a counter that reads "armed" without saying *which* path armed would have looked like evidence and been none, the same shape as the countdown smoke test you rejected two hours ago.

## The tension you have hit, stated plainly

The accessor''s deciding advantage is that it **catches all writers without editing any of them** — which is also why the setter cannot know which writer called it. **Per-site attribution and zero-edit coverage appear to be in conflict.** They are not, but only one design resolves both.

## Direction: attribute from the call stack inside the setter, flag-gated

Capture the caller identity **inside the setter** at the moment of an arming write, and aggregate distinct sites into a set rather than incrementing a scalar:

- On an arming write (`true` only — your "writing `false` must not arm" criterion stands), capture a stack frame, reduce it to a stable `file:line` key, and add it to a `Set` exposed as the diagnostic.
- **The diagnostic is a set of observed arming sites, not a count of frames.** Acceptance then becomes: drive a real session, exercise the 28 paths, assert the set''s cardinality reaches 28 and that every member maps to an enumerated site. **That is the measurement Packet 1 was supposed to buy.**
- **Flag-gated and off by default.** Stack capture is expensive and this is a measurement instrument, not a product feature. It runs for a diagnostic session and is inert otherwise.

**Why this preserves the advantage:** no writer is edited, the 10 sites in B''s `order-manager.js` stay untouched, no commit spans two territories, and the hotfix train keeps its slot.

**Three things to check before dispatching, not after:**

1. **Cost when the flag is on.** Arming writes should be rare — at most about one per frame per chart — but verify that, because if some path arms hundreds of times per frame the instrument perturbs what it measures. You have been bitten by instrument cost twice today already (6.3 of 13.12 points, then 423 ms of 5,336).
2. **Stack availability and shape.** Confirm the reduction to `file:line` is stable on the deployed build. **Minified or bundled frames may not map to your enumerated sites** — and note the surface question in §10 of the detached-DOM finding: `chart/index.html` and `chart/dist-v9/index.html` may not be module-equivalent, which affects where this instrument can even run.
3. **A set that never reaches 28 is a finding, not a failure.** If three sites never fire in any realistic session, that is worth knowing — it may mean they are dead, like the `chart-main.js` class you already found. **Do not treat a short set as a blocked gate; report it.**

**If you see a cheaper design that yields per-site attribution without stack capture, take it — I am naming a shape, not mandating a mechanism.** But do not ship Packet 1 with an instrument that cannot answer the question the packet exists to answer.

## Still owed, and it now outranks M25

**§10 of `FINDING-DETACHED-DOM-LEAK-20260728.md` — the M1 surface question.** `indicator-performance.js` appears by literal reference in `dist-v9/index.html` but **not** in `chart/index.html` or six other shells. **The PO''s CPU and heap sessions today were all taken on `chart/index.html`; your ablation was pinned to `dist-v9/index.html`.**

**If those two shells are not module-equivalent, measurements we have already acted on twice today were taken on non-comparable surfaces.** That question is cheap and it gates the trustworthiness of everything else on the CPU row, including your own ablation bound. **Answer it before M25.**

**Also cancelled:** my earlier assignment to hunt the source of the 28 px detached divs. The retainer paths resolved — the leak is whole detached documents held by a framework root in the app shell, not a chart component. **The elements are innocent; do not spend a minute on them.**
