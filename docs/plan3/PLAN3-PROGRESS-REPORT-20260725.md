# Plan 3 Lag Sprint — Director Progress Report

Date: 2026-07-25, 11:00 · Author: Director · Audience: PO + external advisor
Companion file: `HOST-INDICATOR-LAG-DOSSIER-20260725.md` (the current blocking issue, full detail)

## 1. Executive summary

- Overall progress: **~60%** of the lag sprint (M19-I + M20 quick-kills/families + M21 rendering architecture + permanent gates).
- The first D-034 bundle (7 accepted fixes + login-form fix, 82 paths) is **deployed and provenance-verified on the TEST environment as build `20260725b63`** — the first tripwire-green deploy of the sprint.
- **One live regression blocks acceptance:** on the host chart at high replay speed, indicators repaint on a fixed ~4–5 s cadence instead of continuously. Panels are unaffected. This is now the sprint's single blocking issue (see dossier).
- **Update 12:55 — triage closed, root cause confirmed:** B62's transaction-wide exactness memo chains full-history recomputes whenever an EMA-class indicator is on the chart, armed above a tick-rate threshold (live counter evidence at 100× vs 10×). The two-lane fix build is authorized (dossier §16); the earlier "B62 exonerated live" finding was downgraded to presumed-confounded.
- Rollback to the previous accepted build (b61) is published, tested, and one command away if testers need a usable surface.

## 2. Scorecard by workstream

| Workstream | Content | State | Est. complete |
|---|---|---|---|
| Measurements & instruments (W5) | baseline 1a, painted value/Y RED, v2.x A/B provenance, census/soaks | Baseline 1a captured on old build AND on b63 (not directly comparable — playback-state mismatch); painted A/B still gated on v2.2 + mechanism acceptance | ~55% |
| A — Stop the growth (retained memory) | A1 screenshots→IndexedDB (+caps/teardown family) | **A1 accepted + deployed in b63.** Remaining: caps/LRUs (trail path Q4, tick cache, retained masters) queued behind A1 unlock | ~45% |
| B — Remove the waste (churn/drains) | Q1/Q2/Q6/Q8/Q9 quick-kills, B62 indicator pipeline | All committed/deployed in b63; BUT strong review flagged Q1/Q2/Q8/Q6 edge defects (rework lanes active) and the live 4–5 s cadence regression implicates this family | ~60% built, acceptance reopened |
| C — Rendering architecture (M21) | C0 scorecard, C1 quick wins, C2 OffscreenCanvas, C3 consolidation, C4 decision | M21-2 scaffold accepted + deployed (not product-wired); M21-1 in final review (chart.js locked); C2 wiring, C3, C4 not started | ~25% |
| Permanent anti-lag gate | idle soak, loaded soak, census, byte budgets, parity gate in CI | Specced; census/probes exist piecemeal; not yet a standing CI gate | ~15% |

## 3. What is deployed on TEST right now (build 20260725b63)

Provenance: source `0048865cf` (tag `d034-20260725b63-source`), chart digest `714ca84fed3b…`, homepage digest `83b423fae6ba…`, 33/33 source-uniformity and 29/29 image checks, authenticated tripwire verified host + panel iframe + SW + engine bytes = b63 exactly. Rollback pinned to b61.

Included fixes: A1 (screenshot externalization), Q8 (alert-checker), Q6 (replay-toolbar listeners), Favorites teardown API, Timezone listener API, B62 (indicator exact-tail), M21-2 render-worker scaffold (dormant, not wired), Lane-4 login-form automation fix, plus earlier-committed Q1/Q2 (DOM poll + countdown repaint), Q9 (prefix-slice reuse) from the same branch history.

Excluded (still in review/rework): M21-1 (pan/drawings fast path), Q5/Q7 (bridge timer teardown), Q4 (trail-path caps), all `chart.js` wiring for M21-2.

## 4. Journey highlights since sprint start (2026-07-24)

1. **Audit phase:** four-track code audit found ~30 latent lag sources (timers/leaks, unbounded growth, render hot path, cross-window/storage) — all anchored to file:line; consolidated as M20 with a QUICK-KILL list.
2. **Build phase:** all lanes authored their fixes in parallel under kill-switches; 5 early commits landed (Q1/Q2, Q8, Q6, Q9).
3. **Honesty phase:** the b61 "painted endpoint" RED was finally reproduced with a value/Y oracle after index-based probes returned false greens — re-validating the standing rule that probes must measure what the user sees.
4. **Acceptance phase:** adversarial independent reviews rejected nearly every packet at least once (real defects found each time: IndexedDB durability holes, worker leaks, ACK misbinding, drawings detaching 18–28 px). Seven packets ultimately accepted.
5. **Deploy phase:** two blocked checkpoint attempts (stale b61 markers in source; mirror deltas), then b63 built, pushed, manually deployed by the PO on the VPS (automated SSH unavailable), tripwire green. A stale PostgreSQL lock on `users` was diagnosed and cleared during deployment (environment issue, not build).
6. **Live regression:** PO feel-test found the 4–5 s indicator repaint cadence on the host — the current blocking issue.

## 5. Process facts the advisor should know

- Every fix is behind an individually toggleable kill-switch; the PO can A/B any fix live from the console. This already exonerated B62 in one toggle.
- Provenance discipline is now end-to-end: source tag → strict labeled images → digest-pinned deploy → authenticated runtime tripwire incl. panel iframe. "Wrong build" is no longer a possible confounder.
- The b63 measurement-1a row exists but is **not comparable** to the baseline row (60× not engaged / playback state mismatch); a like-for-like re-run is required after the cadence regression is resolved.
- Premium-model review capacity is the sprint's main throughput constraint; a pause-and-refill protocol is in force.

## 6. Top risks

1. **The cadence regression** (see dossier) — blocks feel acceptance and all comparative measurement.
2. **Q1/Q2/Q8/Q6 rework debt** — deployed fixes with known edge defects; correction lanes active; must not be forgotten under the regression noise.
3. **`chart.js` lock contention** — M21-1, Q1/Q2 rework, and H-S6 all queue behind one file; the lock order must stay explicit.
4. **Measurement comparability** — before/after claims require identical scenario state (speed engaged, playing state, same session); W5's wrapper needs a hard assertion on this.

## 7. Next steps (in order)

> **Updated 12:55 — triage CLOSED, build AUTHORIZED** (dossier Rev 1.6 §16). Root cause identified and confirmed live: B62's transaction-wide exactness memo routes any chart containing an EMA-class indicator into a self-chaining full-history recompute loop (mechanism "M-c"), armed above a tick-rate threshold (climbing counter at 100×, flat at 10×). The original B62-OFF exoneration is downgraded to "presumed confounded." One open characterization question (SMA-alone jumping on 3-year range: chain vs payload churn) is gated into the lab lane, not blocking the build.
>
> **Updated 14:50 — CKPT-023/b66 FAILED at the PO gate; diagnosis REOPENED** (dossier Rev 1.7 §17). The M-c fix produced no observable improvement at 60×: M-c is real but not the dominant visible term. Key correction: at ≥60× the host runs FAST MODE, a third code path the earlier trace never covered; new prime suspect is the host-only per-frame full-history slice+resample (panels reuse host arrays by reference — which is exactly why panels are clean). b66 NOT promoted; b65 is the rollback; **no further fix is accepted until a harness ledger reproduces the host-only lag (RED) and the fix turns that same ledger GREEN.**

1. **Lane 1 (manager, build):** the §12.5 fix package — bridge-owned tips for tail-safe families, per-instance exactness accounting (G4), silent event-driven reconciler, tail-only transferred payloads — behind a kill-switch, RED→GREEN on the cadence oracle with Q2 ON. Guardrails G1–G4 in acceptance.
2. **Lane 2 (manager, lab, first or parallel):** one instrumented b63 session — E3′ characterization (gates final acceptance), lab E6 (settles Fact-1 history), jump-period scaling numbers.
3. W5 measurement wrapper hard-assert (speed/state verified per row) — ships before any before/after claim.
4. Like-for-like measurement-1a re-run → before/after row → PO feel-test → M2 milestone claim if green.
5. Q1/Q2/Q8/Q6 rework debt (each lane inherits the cadence oracle).
6. M21-1 final acceptance → unlock `chart.js` → M21-2 product wiring (C2 begins).
7. Remaining M20 families (caps/LRUs, teardown registry) + Q5/Q7/Q4; then C3, C4, permanent anti-lag CI gate (cadence oracle included).
