# Advisor brief — Plan 3 status, pains, and forward plan
Date: 2026-07-27, 15:30 · Author: Director · Audience: external advisor (last briefed during the host-indicator-lag investigation, ~Rev 2.4 of the dossier)
Companions: `HOST-INDICATOR-LAG-DOSSIER-20260725.md` (closed thread), `INTAKE-MERGE-20260727.md`, `TICKETS-INTAKE-20260727.md`, `PLAN3-BOARD.md` § Intake 2026-07-27

## 1. What happened since your last update (chronological, compressed)

1. **The host-indicator lag is CLOSED.** Cure named precisely: commit `852420adc` had unconditionally loaded `indicator-performance.js`, activating older default-ON exact-tail/family-tail ownership. The ungated cure was adopted default-ON after kill-switch verification; sustained-replay evidence shows 0 ms lag; a permanent regression gate encodes the scenario. Your G1–G4 guardrails and the "name the cure, not just the symptom" discipline were decisive — the PO's feel-test and the causal diff both landed on the same commit.
2. **MC-RESTORE fixed and deployed.** Cold panels restore file ID + exact symbol after reload (the black-panel-on-reload class). Live on TEST as build `20260726b75`, automated-GREEN including panel identity restoration and the exact-tail kill-switch cell.
3. **A new 135-report ticket wave was triaged and merged into Plan 3** (2026-07-27 intake: 124 support tickets from 100 testers on the OLD website + 11 tickets from an experienced external tester, Rayan). Dedup → ~55 distinct issues → 14 existing mechanism rows strengthened + four new rows: **M23** (replay rollback trade-state), **M24** (trade registration/ledger integrity), **M25** (tick-path/stepping fidelity), **M26** (viewport/zoom/scale contract). A new **Lane 5 (Trade Lifecycle)** owns M23/M24 with exclusive `order-manager.js` write ownership. Parallelization is governed by a file-ownership matrix; anything touching `chart.js` serializes behind the integration branch.
4. **Overnight sprint delivered:** M23 fix (rollback permanently cancels; no relocation/reactivation), M24 fix (canonical trade-ID grammar across browser/backend/SQLite/PostgreSQL; deterministic duplicate merge; transactional legacy-alias migration), M25/M26 deterministic REDs (no product edits yet), Q4 harness hardening (real-call-graph, fail-closed), and a sealed post-B75 candidate.
5. **A full PO test day produced the best live evidence of the sprint:**
   - **Memory question CLOSED as a question.** Four measurement rounds: single-chart is healthy (peaks <1 GB, pause reclaims, symbol switch releases — better than the old website, which retains); multichart playing spikes to **2.5–2.7 GB with CPU ~128%** (mixed symbols/TFs) vs ~1.0 GB (same-symbol panels); teardown floors are non-monotonic across four cycles (302→442→465→988→530 MB) — **no runaway leak**, a ~230 MB teardown residual and per-panel dataset duplication remain as measured M21 targets.
   - **M23 rollback: unreproducible on the new build.** All four rollback doors (step-back, drag-back, rollback-while-open, rollback-then-play-forward) correctly clear future trades, journal, and balance. Rayan's ghost-trade class appears to be an old-surface defect; the overnight hardening is retained as defense-in-depth.
   - **V6 order-drag sweep:** several passes (drag-follow, no phantom TP, no SL/TP inheritance) + five real defects (lines vanish during drag / partial render, entry-drag doesn't recompute SL/TP until release, stacked-TP label collision + activated-order grab priority, SL/TP lines partially invisible = TAL-01885 confirmed on new build, release-gated preview calcs).
   - **TAL-01896 duration bug confirmed with a sharp signature:** open trades show epoch-scale durations (139,271h; 110,036h right after a rollback) — open-trade duration computed against the wrong clock; RED refined accordingly.
6. **Governance held under pressure, three times in one day:** B76 was stopped pre-deploy when a reversed stale oracle was caught (a test lying RED); B77 was re-sealed and requalified from scratch; B78 was parked when a retained test failure's signature wouldn't stabilize — diagnosis proved same-mechanism with nondeterministic test output (UUID/rAF noise), the harness now signs semantic checkpoints (10/10 × 3 builds), and a formal **"baseline-retained failure" policy category** was created (stable-signature proof + scope exclusion for D-030/I16/security + named debt row + per-instance sign-off).

## 2. Scoreboard

- Overall: **~70% of the enlarged Plan 3** (the intake enlarged the denominator; the lag/restore/deploy infrastructure work is behind us).
- Deployed and PO-verified: lag cure, MC-RESTORE, memory hygiene on single chart.
- Sealed awaiting PO retest: B77 (F5 black-panel restore correction, V1 indicator/seek race, V2 crosshair invalidation, V5 scheduler).
- Fixed awaiting deploy+re-verify: M23/M24 hardening, Q4 harness.
- Diagnosed awaiting fix: V6 five defects, V8 pins (no persistence layer exists — needs a small owner-scoped preference contract), TAL-01896 duration clock, M25 (4 REDs), M26 (2 REDs).
- Open engineering question: **multichart-under-load** (see pains).

## 3. Main pains (ranked)

1. **Multichart under load is a capability gap, not a bug list.** Four independent signals in one day: 2.5–2.7 GB working set with CPU saturation during multichart replay; symbol-change latency that is load-dependent (5–6 s quiet vs ~60 s under pressure); a panel freezing ~15 s then catching up in a burst; the V3 soak harness timing out just *rendering* four panels. Under saturation the host indicator lag *symptom* reappears (triaged as suspected new mechanism per the sticky protocol, kill-switch state recorded — not as a cure failure). Everything says the per-panel data/render duplication must be collapsed (single-data-owner / shared-dataset M21 architecture), not patched around. This is the sprint's long pole.
2. **Verification bandwidth is the clock.** Agents build overnight; closure needs human eyes (PO solo). Today the PO's structured testing (memory rounds, rollback doors, V-sweep) was worth more than any single fix — but it serializes everything: B77 retest, soak observation, reporter re-verification for M23/M24.
3. **Consolidation friction.** Fixes accumulate in isolated worktrees (correct under the merge freeze) but each consolidation (B76/B77/B78) pays a sealing/requalification tax, and twice this week the tax exposed real problems (stale oracle, nondeterministic harness). The brakes are working — but each cycle costs hours, and API-capacity limits interrupted parallel review tasks more than once.
4. **Old-surface noise in the ticket stream.** The 100 testers still run the OLD website; most of their reports are already-fixed families. Until production promotion, every intake pull needs stale-surface triage to avoid re-fixing ghosts. (Mitigated by the intake-merge protocol; will disappear at promotion.)

## 4. Forward plan (Director's current sequencing)

1. **B77 lands → PO retest** flips Test 0/V1/V2/V5 (worth ~5 points and unblocks the sweep's remaining closures).
2. **B78 promotes** under the activated baseline-retained instance (paperwork: scope line + debt row).
3. **Heap capture** with the two named targets (230 MB teardown residual; per-panel dataset duplication) → feeds the M21 decision.
4. **M21 completion decision** (the big one — advisor input wanted, §5): scope the shared-data-owner/render-runtime completion for multichart so panels stop each paying full price. Until it lands, multichart carries a known working-set ceiling.
5. **Trade-lifecycle closure:** deploy M23/M24 hardening in the next bundle; Rayan re-verifies his own scenarios; TAL-01896 duration fix (small, well-evidenced) rides along.
6. **Smaller lanes in parallel under the ownership matrix:** V6 five defects (Lane 3, after Lane 5 releases `order-manager.js`), V8 preference contract (design note → sign-off → implement), M25/M26 fixes on their REDs.
7. **Production promotion** for the 100 testers once the consolidated surface holds: expect a recurrence wobble (device caches/service workers), absorbed by the sticky protocol.

## 5. Questions for the advisor (where your input changes decisions)

1. **Multichart architecture (the long pole).** Evidence: memory scales with distinct datasets per panel (~1.0 GB same-symbol vs 2.7 GB mixed); CPU saturates during multichart replay; teardown leaves ~230 MB. The M21 scaffolding (single-data-owner model, visible-window mirror pools, worker deploy preflights) exists from the earlier workstream. Question: for a solo-PO product at this stage, do you endorse **completing M21's shared-dataset/single-render-runtime architecture now** (week-plus, structural, kills the whole under-load family), or a **bounded interim mitigation** (per-panel LOD/decimation caps + panel-count-aware replay cadence) to make 2–4 panels acceptable while M21 completes in the background? We are wary of interim work that becomes permanent — but also of a week with no felt improvement for multichart users.
2. **Soak design under a working-set ceiling.** The V3 soak now runs two panels (four timed out). What soak profile best predicts real-tester pain at promotion: N sessions × 2 panels, or must a 4-panel cell exist pre-promotion even if it needs a raised harness timeout?
3. **Promotion strategy for the 100 testers.** Options: (a) promote after B77+B78+trade-lifecycle bundle (soon, visible wins, multichart ceiling documented as known); (b) hold promotion until the multichart work lands (later, but the testers' first impression of the new product includes its weakest area fixed). The testers' first impression is a one-shot asset — your read on sequencing reputation risk vs feedback velocity?
4. **Preference persistence contract (V8/M15).** Pins/favorites are React-only state today; the fix is a small owner-scoped preference store (survives refresh/re-enter/new sessions, I16-excludable). Any design guardrails you'd impose from having seen this class go wrong — e.g., server-authoritative vs local-first with sync, migration posture, or "don't let per-session and per-user preferences share a namespace"?
5. **Test-noise hardening.** This week caught a reversed stale oracle (B76) and a nondeterministic signature (B78, UUID/rAF noise — now semantically signed). Both were caught by process, late. Is there a cheap standing practice you'd recommend to catch oracle staleness/nondeterminism *at authoring time* (e.g., mandatory 3× repeat-run at RED creation, oracle expiry dates, mutation-guard minimums), given our worker/relay model?

## 6. One-line ask

Reply on §5 in any order; Q1 (multichart architecture) gates the biggest scheduling decision of the sprint and is wanted first.
