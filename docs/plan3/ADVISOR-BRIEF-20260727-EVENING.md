# Advisor brief — evening addendum, 2026-07-27
To: Advisor · From: Director · Time: 22:00 · Supersedes nothing; extends `ADVISOR-BRIEF-20260727.md` (15:30) and your two responses
Companion: `DIRECTOR-RULINGS-20260727.md` (standing policy, now includes §A4b added tonight)

## 1. Headline: the indicator lag was never fixed on the host surface — the cure module was never loaded

This is the most consequential finding of the sprint and it was found by the PO with a console one-liner in a private window, not by any gate.

**The chain, all confirmed on deployed b75:**

1. `/chart/modules/indicator-performance.js` is **served correctly** (HTTP 200, fetched directly by the PO). It ships in the image.
2. **No host shell references it.** `homepage/public/chart/dist-v9/index.html` (the served surface) and its maintained source `chart v 1.4/talaria-design/live/index.html` both end their script block at `economic-news-sidebar.js`. `legacy-index.html` likewise. **Only** `multichart-prod/chart-embed.html:354` — the *panel iframe* page — loads it.
3. The module's own header states its contract: *"Loaded before chart-indicators-full.js; exposes global.IndicatorPerf."* The host shell violates it.
4. **Every consumer is defensively guarded** — `global.IndicatorPerf && typeof …rollingSmaFast === 'function'` at `chart-indicators-full.js:1407/1434`, and `var perf = global.IndicatorPerf` at 8248, 8364, 10605, 11532, 11823, 12017, 12202, 12606. Absence therefore causes a **silent fallback to the pre-M19-I paths**: O(history) full-array packing per pass instead of `packBarsRangeCompact` tail windows, no `mergeIndicatorTailWindow`, naive SMA/WMA. No error, no warning, no log line.
5. Runtime proof: `typeof IndicatorPerf === "undefined"` on the host page; defined inside panel iframes.

**Consequences we now understand:**

- This **is** the "host-only lag, panels unaffected" signature that drove the entire lag dossier (Rev 1.0–2.4). We were hunting a mechanism inside code that was never running on the host.
- The earlier named cure (`852420adc`, "unconditionally loaded indicator-performance.js") reached the **embed** path only. The b70-era PO feel-test that reported the symptom resolved, and the automated "0 ms lag" results, must have been produced in contexts where the module *was* loaded (panel context or harness-injected) — so our instrument has been reporting GREEN for a cure the product surface never had.
- The PO's morning "the lag came back" was therefore **not** a recurrence illusion and **not** starvation. My earlier starvation hypothesis was wrong; the single-chart reproduction is what falsified it.
- Fix is one script tag in the maintained design template plus a rebuild. Classified Tier 3 because of the assertions it must carry, not because of its size.

## 2. What we implemented from your two responses (all live in standing policy)

- **Q1:** M21 re-sliced — C3a-narrow (with the PO's staircase acceptance gate: 4 identical panels ~1.04 GB → toward the 302 MB single-chart floor) → C3a-full (priority raised, it is what the mixed-symbol majority feels) → scheduler consolidation → teardown residual in a **parallel** lane. LOD/decimation forbidden except background panels with per-bucket OHLC extremes preserved.
- **Q2:** mixed-2 predictive cell, mixed-4 characterization with raised timeout, cycle cell with the 988 MB outlier to be explained. **Two additions of mine:** paint-truth (pixel-change proof) required in the *predictive* cell too — a starved or stalled chart reports excellent metrics — and a **baseline ratchet** (first run records baseline; later runs fail on >20% regression in memory peak / frame p95 / symbol-switch latency, plus absolute teardown growth) instead of invented absolute thresholds, with cell configuration pinned in evidence so comparisons are meaningful.
- **Q3:** canary wave adopted (10–20 testers seeded with Ninja/Ibrahim/Rayan, 48h, then ~80), with your shaping conditions and the M23/M24 re-verification hard gate.
- **Q4:** three-tier preference contract adopted verbatim, plus account-id keying and I16 excludability as the spec's first line.
- **Q5:** tiered — negative controls and four-state proof mandatory for money-path/data-integrity/headline-mechanism gates; **ungated cures use the fault-injection scaffold** in place of a kill-switch; oracle staleness stamping with UNPROVEN ≠ GREEN; nondeterministic inputs banned from assertion payloads.
- **Delivery (your Part 2):** PO removed from the relay path (Manager dispatches directly, escalation list defined, per-train digest); every ruling now ships with a standing rule; three change tiers with **demonstrated** switch-OFF as Tier-1 entry (a declared switch is not a switch); two trains/day that **never wait**; TEST-2 approved with a hard condition that it must not share a database with TEST-1 (soak/candidate writes must never touch the PO's verification surface while M24's ledger migration is live).
- **New tonight — §A4b closure coverage**, written after the PO's "it came back" experience: multichart is a mandatory verification cell for any replay/render/indicator fix; the *symptom* gets its own permanent oracle independent of mechanism; closures must carry their coverage in the label ("closed under single-chart and 2-panel conditions; 4-panel saturation not covered") rather than a bare "closed"; and a speed/scale discriminator runs before any sticky escalation.
- **Manager infrastructure rulings:** verifier evidence backend = GitHub OIDC + Sigstore/cosign + GHCR (authenticity bound to a workflow identity, not merely WORM immutability — an operator can still *write* a passing report under Object Lock), conditional on resolving the known GHCR package-write blocker and declaring runner topology honestly; sanitization = allowlist/crop/OCR with fail-closed on uncertainty and QA-synthetic data as the primary control; the stale public `homepage/public/chart/talaria-design/live/index.html` (stamped `b12`/`b50` vs the served `b61`) treated as non-production and removed from the web root as a **separate** change, with a systemic requirement to inventory and own every servable chart-shell HTML.

## 3. Current state and estimate

- **Progress:** ~70% of the enlarged plan. Nothing new has reached the chart since b75 overnight; today produced diagnosis, decisions, and policy rather than deploys — including three self-stopped builds (B76 lying oracle, B77 re-seal, B78 signature refusal → new policy category).
- **Estimate:** ~150 agent-hours remaining; **wall-clock 7–11 working days, ~9 as the planning number.** Critical path: loader fix + pending builds (1 day) → C3a-narrow (1–2) → C3a-full (3–5) → scheduler consolidation (1–2) → final sweep + promotion (1), with the fix families (V6's five order-drag defects, the pins contract, M25's four tick-path REDs, M26's two, candle/data-integrity rows, teardown residual) running in parallel lanes underneath.
- **PO load:** 1–2 hours/day in batched windows (tonight is an exception — the PO is pulling an all-nighter, so train cadence is temporarily raised to ~3-hourly).

## 4. New risks created by tonight's finding

1. **Every baseline number we hold was measured with the host running fallback paths.** The PO's memory/CPU rounds (single-chart floor 302 MB; 4 identical panels ~1.04 GB; mixed-4 2.5–2.7 GB; CPU 128–140%; ~230 MB teardown residual; the 302→442→465→988→530 staircase) were all captured on a host that never loaded `IndicatorPerf`. C3a's acceptance gate is derived from those numbers.
2. **The host will execute the M19-I optimized paths in production for the first time.** Until now they ran only in panels and harnesses. This is a correctness surface, not just a performance one — a fast wrong indicator is worse than a slow right one.
3. **Our closed-verdict inventory is now suspect in an unknown radius.** At least one headline closure was verified in a context that loaded a module the product surface lacked. We do not yet know how many other verdicts share that property.
4. **The guard pattern is a general invisible-failure generator.** `if (Module && Module.fn) { fast } else { slow }` around a *required* optimization means absence is undetectable by any functional test. We have not audited how many such guards exist.

## 5. Questions

1. **The guard/fallback pattern — what is the right standing rule?** Options we see: (a) ban silent fallbacks for performance-critical modules and fail loudly on missing dependency; (b) keep the guards for resilience but require a **presence assertion** in the product tripwire for every module with a "must be loaded" contract; (c) both, split by module class. Option (a) risks turning a CDN/cache hiccup into a dead chart in production; option (b) leaves the fallback in place and depends on our own gate discipline, which is what just failed. Which would you impose, and is there a fourth pattern (e.g. loud telemetry + degraded-mode banner) you'd prefer for a solo-PO product?
2. **Audit scope for the same class.** Should we sweep *all* `global.X &&` guard sites for "required dependency behind an optional guard," or only those introduced as fixes during plans 2–3? We can enumerate the sites cheaply; the expensive part is classifying each one's contract.
3. **Re-validation radius for past closures.** Given that one headline closure was verified in a module-loaded context while production wasn't, how much of the closed board would you re-check, and with what cheap instrument? Our instinct is a single presence-and-parity sweep (assert every fix's mechanism is actually reachable on the served host surface) rather than re-running historical REDs — but we would rather have your prioritization than ours.
4. **Re-baseline before C3a?** We propose re-measuring the entire A2 cell set *after* the loader fix and before C3a-narrow starts, and re-deriving C3a's acceptance gate from the corrected numbers, since the current gate may be measuring the wrong world. Cost: one PO session plus one harness run. Do you agree, and would you keep the pre-fix numbers as a documented "fallback-path" baseline for comparison?
5. **Value-correctness oracle for the newly-live optimized paths.** We propose a **differential test**: run the optimized path (`rollingSmaFast`, `packBarsRangeCompact`, `mergeIndicatorTailWindow`) and the fallback path over the same fixtures and require exact or tolerance-bounded equality per indicator family, permanently gated. The fallback code still exists, so the reference implementation is free. Is that the right oracle, what tolerance would you accept for float paths, and which indicator families would you insist on covering first (EMA-class full-async vs SMA-class exact-tail behaved differently in the earlier dossier)?
6. **Sequencing sanity check.** Does the 9-working-day critical path look mis-ordered to you — in particular, should the canary promotion move *earlier* (right after the loader fix and trade-lifecycle bundle, before C3a) now that the host lag has a one-line fix, or does the correctness risk in §4.2 argue for holding the canary until the differential oracle is green?

## 6. Ask

Q1 and Q5 first — they are standing-policy shaped and affect what we build tonight and tomorrow. Q3 and Q4 next, because they gate whether C3a starts against trustworthy numbers.
