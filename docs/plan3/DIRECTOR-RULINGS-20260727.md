# Director rulings — 2026-07-27 (standing policy)
Author: Director · Binds: Manager, all lanes · Inputs: `ADVISOR-BRIEF-20260727.md`, advisor §5 response, advisor delivery-latency addendum
Status: **standing rules, not case-by-case.** Anything here is decided; do not escalate these classes again.

---

# Part A — Product rulings

## A1. M21 re-sliced; C3a-full is the priority increment

Multichart working set tracks **distinct datasets held**, not panels drawn (PO measurement: ~1.0 GB with 4 identical panels vs 2.7 GB mixed symbols/TFs, single-chart floor 302 MB). Decimation reduces what is drawn and therefore cannot address the mechanism.

Order of increments, each independently valuable and permanent:

1. **C3a-narrow** — shared dataset for panels with identical symbol+timeframe, extended to identical-symbol-across-TFs by sharing the raw store beneath TF aggregation.
   **Acceptance gate (measurable):** four identical EURUSD 1m panels must fall from ~1.04 GB toward the 302 MB single-chart floor. Publish the measured number; a qualitative "feels better" is not acceptance.
2. **C3a-full** — single data owner for all panels including mixed symbols; panels hold visible-window views, not full copies. **This is the increment the dominant workflow feels** — the ticket corpus (Rayan EURUSD+GBPUSD, Ali NQ+ES, Shahed/TAL-01887 NQ+ES) is overwhelmingly mixed-symbol comparison layouts. Priority raised accordingly; narrow exists to de-risk full, not to satisfy users.
3. **Scheduler consolidation** — single replay/render scheduler, N cameras. Panel-count-aware replay cadence lands here permanently.
4. **Teardown residual (~230 MB)** — Workstream-A retained-set hygiene (view/listener/cache release on panel destroy). Runs in a **parallel lane**; does not queue behind M21.

Not greenfield: `visible-window-mirror.mjs`, `reusable-buffer-pool.mjs` and the audited `m21-3a-single-data-owner-model.mjs` already exist in-tree. This is wiring audited components into the product path.

**Mitigations permitted** (both are subsets of the final design, kept forever): panel-count-aware replay cadence; an honest in-product panel/dataset guidance or soft ceiling.
**Mitigation forbidden:** bespoke LOD/decimation as a stopgap. Narrow exception — decimation is allowed only where multiple bars already map to one pixel column, **only for inactive/background panels**, and **only with per-bucket OHLC extremes preserved**. Bucketing that misrepresents wicks is a G1 correctness violation, not an optimization.

**Host-lag-under-saturation symptom:** no lane opened. It is the expected signature of a starvation mechanism and is the cheapest verification that C3a-full worked — retest it after the increment. **Tripwire:** if the symptom appears on the **2-panel** cell (not only under 4-panel saturation), that is a different animal — open triage immediately.

## A2. Soak profile

- **Primary predictive cell:** 2 panels, **mixed** symbols/timeframes, long duration. (Same-symbol soaks reassure and predict nothing.)
- **Worst-case characterization cell:** 4 panels, mixed, **raised harness timeout**. Output is a documented ceiling, not a pass/fail verdict. Record working-set peak, CPU, frame-interval p95/max, symbol-switch latency under load, teardown floor.
- **Cycle cell:** enter/exit ×4. The "no runaway leak" verdict stands; the **988 MB outlier at cycle 3 requires one line of explanation** (snapshot timing vs transient retention). If it recurs at the same cycle index across runs, it is not noise.
- Re-run mixed-2 and mixed-4 as the acceptance measurement after each C3a increment.

**Re-baseline required before C3a (added 2026-07-27 evening).** Every number we hold — single-chart floor 302 MB, 4 identical panels ~1.04 GB, mixed-4 2.5–2.7 GB, CPU 128–140%, ~230 MB teardown residual, the 302→442→465→988→530 staircase — was measured on a host running **fallback** paths, because `IndicatorPerf` was never loaded there. Sequence: loader fix deployed → re-measure the full A2 cell set → **re-derive C3a-narrow's acceptance gate from the corrected numbers**. Retain the pre-fix set explicitly labelled **"fallback-path baseline"**: it is not garbage, it measures a different world, and the delta between baselines is our first real measurement of M19-I's value on the product surface. The differential oracle runs in parallel and does not gate the baseline. Budget for one cheap baseline re-run if §A7 forces material changes to the optimized paths.

## A3. Promotion: canary wave, moved EARLIER — gated on correctness, not on C3a (revised 2026-07-27 evening)

**Sequencing (supersedes the original ordering):** loader fix with §A4c presence assertions → §A7 differential oracle green on rolling-subtraction and recursive families → M23/M24 re-verified on the deployed build → **data-integrity reproduction check (Director addition, see below)** → **canary wave** → re-baseline (§A2) → C3a-narrow → C3a-full. Remaining ~80 promoted after 48 canary hours absent anything correctness-shaped.

Rationale: C3a is a **performance** project; holding a correctness-cleared, materially better product from testers for a week of performance work is the wrong trade. The §4.2 correctness risk is bounded and testable, and the oracle settles it in about a day. The canary cohort is an argument *for* going early — 10–20 experienced traders reading indicators on their own instruments is a correctness instrument we cannot buy, running in parallel with the oracle. Multichart-under-load is also the weakness we would most prefer others to characterize. Ship with `degradedModules[]` live so any future module loss announces itself within hours.

**Director addition — data-integrity reproduction check before the canary.** The advisor did not have these rows in view. TAL-01922 (phantom daily candle for a day that hasn't started), TAL-01918 (previous candle's close mutating at next open), TAL-01802 / TAL-01886 (price differing across timeframes for the same instant) are **wrong-data** reports, and experienced traders will spot them immediately in a journaling product. They were filed on the OLD website, so they may not reproduce. Required: a cheap PO reproduction check on the corrected build. Each row must be **not-reproducible, fixed, or explicitly disclosed** in the known-limitations note before the canary opens. Wrong data outranks slow rendering for this cohort.

**10–20 testers first, seeded with Ninja, Ibrahim and Rayan, 48 hours, then the remaining ~80.** Rationale: the PO is simultaneously relay, tester and decision-maker; a 100-user intake wave consumes the exact hours that are the engineering critical path. The canary preserves real signal and ends stale-ghost triage for that cohort while bounding both intake volume and blast radius, and it makes rollback executable (rolling back 15 users is a message; rolling back 100 mid-session is an incident).

**Hard gate (co-signed by the advisor, non-negotiable, D-030 class):** M23/M24 must be **PO- and Rayan-re-verified on the deployed build**, not merely deployed, before any promotion wave.

**Shaping conditions:** ship a short known-limitations note (multichart 3+ mixed-symbol panels is a known performance ceiling, fix in progress, report everything else); pre-flag the ticket form's Area field for that scenario so those reports auto-cluster into one row; pre-write the recurrence-wobble response (device caches / service workers) so it is not mistaken for regression.

## A4. Preference persistence contract (V8/M15)

**First line of the spec: preferences are keyed to account id and remain excludable from customer data per I16.**

Three tiers, never collapsed:
1. **Per-user** — pins, favorites, theme, defaults. Syncs across devices, long-lived.
2. **Per-workspace/layout** — panel config, symbols per panel, indicator sets. Belongs to the named layout, *not* to the user globally; otherwise opening a saved layout silently rewrites global preferences.
3. **Per-session/ephemeral** — scroll position, last replay point, transient UI. Never synced, never migrated, cheap to lose.

Guardrails, in priority order:
- **Per-key writes, never a monolithic blob.** Our panels are iframes — concurrent writers by construction. Last-write-wins per key is safe; per blob is a data-loss generator.
- **Local-first, non-blocking, and never overwrite remote with defaults on read failure.** An empty or failed read is never authoritative. This single clause prevents the "sync wiped my settings" incident.
- **Schema version from day one; preserve unknown keys on write.** An older client must not strip keys it does not recognise.
- **Lazy migration on read**, old key retained one full release cycle, then dropped (same posture as M24's transactional alias migration).
- **IDs only, bounded size.** References, never embedded objects, never anything image-shaped.
- **Reset-to-defaults path reachable without loading the chart** (URL param or isolated settings route), so a corrupted store is self-service recoverable.
- Fail-open on read, fail-safe on write, never a modal for a preference failure.

## A4b. Closure coverage — added 2026-07-27 after a PO recurrence-illusion

Trigger: the indicator-lag cure was verified single-chart and felt "fixed"; the PO then saw the symptom again under 4-panel mixed-symbol replay at 60x (CPU 128–140%). Most probable cause is **starvation reproducing the same symptom via a different mechanism** — not a failed cure. The process defect is ours: we verified a narrower condition than the product is used in, and labelled the closure broadly.

Standing rules:

1. **Multichart is a mandatory cell.** No replay, render, or indicator fix may be declared closed until its state matrix includes a verified **multichart** cell (minimum: mixed-2; 4-panel where the mechanism plausibly scales with panel count). Assumed cells are not verified cells.
2. **Gate the symptom, not only the mechanism.** A user-visible **indicator-lag oracle** (painted indicator endpoint vs painted price on the host) runs in both A2 soak cells, independent of which mechanism is suspected. When one symptom has multiple possible causes, the symptom needs its own permanent watch.
3. **Closures carry their coverage in the label.** Write "closed for mechanism X under single-chart and 2-panel conditions; 4-panel saturation not covered" — never a bare "closed". A precise label prevents an uncovered cell from being experienced as a regression.
4. **Recurrence triage order is unchanged** (stale surface → same-symptom-different-mechanism → genuine fix failure), but step (b) now requires naming the second mechanism and opening a cross-linked row, not merely asserting it.
5. **Discriminator before escalation:** when a closed symptom reappears under load, run the speed/scale discriminator first (same layout at low speed vs high speed, and module/kill-switch presence check in the affected context). Starvation and mechanism failure are distinguishable in minutes; do not open a sticky row on the symptom alone.

## A4c. Bug class: capability loss without failure — module contract & presence enforcement

Named class (advisor): **capability loss without failure** — a required component absent, every consumer degrading politely, no error, no log, no wrong-looking output. Existing gates detect *wrong behavior*; this is *absent behavior that looks correct*. Presence/reachability is therefore a **distinct gate category**, not a stricter version of existing gates.

**Reclassification, binding:** `IndicatorPerf` is **not** a performance module. Its absence switches which algorithm computes displayed values (naive SMA/WMA vs `rollingSmaFast`; full-array packing vs `mergeIndicatorTailWindow`). Two implementations never proven equal are two possible answers on screen. It is a **correctness-class dependency** until §A7 parity is proven.

**Four-part rule:**

1. **Contract manifest per module (data, not prose).** Each module declares what it provides (`IndicatorPerf`), which surfaces require it (`host` / `embed` / `harness`), and its class. The module header already states this in prose — promote it to machine-readable.
2. **Build/deploy preflight assertion — PRIMARY GATE.** Statically verify every servable shell HTML references every module declared required for that surface. **Fails the build.** A missing script tag is a deterministic, build-time-detectable fact; catching it there is free and can never reach a user. This check would have failed at the moment `852420adc` landed. It iterates the servable-shell inventory (see B5/§A4c-5), so a forgotten shell is a build failure, not an archaeology finding.
3. **Runtime tripwire presence assertion — SECONDARY GATE.** The tripwire already proves *bytes* on the served surface; extend it to prove *symbols*: assert `typeof IndicatorPerf !== "undefined"` on host **and** panel post-deploy. Covers the gap between "referenced" and "actually executed" (parse error, CSP block, load-order violation). Implementation: each shell publishes `window.__TALARIA_LOADED_MODULES` at boot; the tripwire reads it.
4. **Runtime behavior split by class — keep the guards, remove the silence:**
   - **Correctness class** (absence changes displayed values or money-path results): guard stays for resilience, but the fallback fires a **one-time loud telemetry event**, sets a degraded-mode flag, and surfaces a **discreet non-blocking** degraded-mode indicator. Never a modal, never a dead chart. Downgradeable to performance class once §A7 parity is proven.
   - **Performance class** (slower, provably identical output): guard + telemetry, no user-facing signal.
   - **Enhancement class** (optional feature): silent fallback acceptable.
5. **`degradedModules[]` in the support-button passport.** Every ticket carries which required modules were missing on that user's surface. Highest value-per-line item in the whole policy: this class becomes self-reporting through the ticket stream instead of requiring dossier archaeology.
6. **Director addition — degraded-mode must be auditable in trade data.** If any order is placed while a correctness-class module is missing, the **trade record stores the degraded-mode flag and the missing module list**. A journaling product must never hold trades computed by an unrecorded code path. D-030/I16 adjacent; applies to persistence, not just telemetry.

Rejected: fail-hard-at-runtime on missing dependency. A CDN/cache hiccup must never kill a trading chart — and with build-time enforcement its benefit is captured without its risk.

## A6. Servable-surface inventory (systemic)

Every servable chart-shell HTML under a public web root must be either **owned and stamped** or **removed**. Recorded on the board. Uniformity assertions cover host shells, not only modules. Evidence of need: `homepage/public/chart/talaria-design/live/index.html` was stamped `20260723b12`/`b50` while the served shell stamped `b61` — an unowned, drifted, publicly reachable chart shell.

## A7. Differential parity oracle (newly-live optimized paths)

Adopted, permanently gated. The fallback implementations are a free reference; the oracle runs optimized vs fallback over identical fixtures.

1. **Two-tier tolerance — numeric AND painted.**
   - *Numeric:* relative epsilon **per family**, declared and justified in the packet and **never chosen to fit the observed diff**. Non-recursive rolling families (SMA, WMA, Bollinger, Donchian, stochastic): ~1e-9 relative. Recursive families (EMA, MACD, RSI, ATR, ADX): per-family bound, because seed and warm-up length legitimately differ between implementations.
   - *Painted:* divergence must be **sub-pixel at maximum zoom** on the fixture's price scale — the user-facing truth, in the same currency as G1/G2 and the cadence oracle.
2. **Long-series drift cells are mandatory** at 100k, 500k and ~1M bars, asserting **divergence does not grow with series length**. Expected defect. **Director narrowing (verified in source):** `rollingSmaFast` maintains a running sum (`sum -= leaving; sum += entering`) with no compensation and no periodic re-seed — it is the drift-bearing function. `rollingWmaFast` recomputes its full window per bar (`for j < p`) and carries **no** drift risk. Focus drift cells on SMA-derived families accordingly. If drift grows: compensated summation (Kahan/Neumaier) or periodic exact re-seed every N bars.
3. **Adversarial fixtures:** gaps and weekend boundaries, zero-volume and flat bars, extreme volatility, and **scale extremes** — index futures and JPY-quoted pairs (large magnitudes) vs crypto with many decimals (small magnitudes). Float error is scale-dependent and our users span both.
4. **Coverage order:** rolling-subtraction families first (SMA/WMA/Bollinger/Donchian/stochastic — highest drift risk *and* newly live on the host), then recursive (EMA/MACD/RSI/ATR/ADX — warm-up/seeding hazard), then cumulative (VWAP/OBV — unbounded accumulation on long ranges).
5. **The fallback path is retained and must keep executing in CI forever.** It is both the oracle's reference and the resilience path. Dead unexecuted reference code rots and gives false comfort; deletion is not authorized.

## A8. Reachability sweep for past closures + verification context in verdicts

This bug was not a broken mechanism but an **unreachable** one, so test the actual failure mode rather than re-running historical REDs.

1. **Presence-and-parity reachability sweep.** For each closed fix, assert its mechanism is reachable on the **served host surface**: module present, expected symbol defined, kill-switch in expected state, and where identifiable the optimized function actually bound at the call site. Run against host **and** panel surfaces — divergence between them is tonight's signature.
2. **Priority by consequence:** (a) money-path and data-integrity closures (D-030 / M23 / M24 class) — a silently unreachable ledger fix is the worst available outcome; (b) headline mechanism closures, especially any whose closure evidence came from a panel or harness context; (c) everything else by sweep, no manual classification.
3. **Every closure record must state the surface it was verified on** (host / panel / harness / all), alongside the §A4b coverage label. Root failure in one sentence: *a verdict was recorded without its verification context.* Making context part of the verdict closes this class.
4. **Guard-site audit (scope: everything).** Enumerate all `global.X &&` guard sites — do not limit to plans 2–3, since limiting by provenance assumes we know where the class lives, which is the assumption that just failed. One-question triage per site: *if this dependency is absent, does the user get **wrong data**, **slow data**, or **no feature**?* "Wrong data" sites join the correctness class with immediate build-time enforcement. Plan-2/3 fix sites are swept first for triage order.

## A9. Memory closure REOPENED (2026-07-27, 23:25)

The disposition "memory closed as bounded multichart working set" is **withdrawn**. It was scoped to a configuration narrower than real usage.

External tester Rayan, on b75 with indicators and live trades present, reached **3.5 GB on a SINGLE layout** on the 1m timeframe, describing it as "untradable," and **2.5 GB on four layouts with a ~90-second full freeze**. Dropping to one layout restored responsiveness immediately, but stalls resumed on one layout under continued play. Memory was observed sawtoothing — falling then climbing again.

Three corrections follow:

1. **Memory is not a multichart-only problem.** A single chart with indicators and trades on 1m exceeds anything measured in the PO's earlier sweeps. Any future memory measurement cell **must** include indicators and open trades, and must include a fine-timeframe (1m) sustained-replay case. Cells without those variables do not close the row.
2. **A 90-second freeze is a distinct defect from lag** and gets its own row. Garbage collection alone does not explain it; synchronous whole-history work on the replay path does.
3. **Measure before building.** C3a's architectural re-slice must not begin until the per-tick full-resample hypothesis in `PO-SWEEP-RESULTS-20260727.md` is confirmed or excluded, using the existing `_mcDiag.resamples` counter. If the dominant cost is per-tick O(n) resampling rather than per-panel duplication, C3a is the wrong instrument and would be built against a misdiagnosis.

## A10. UI control inventory (extends §A4c / §A6)

The presence gate in §A4c asserts **module** presence. It does not catch a missing **UI control**, and tonight produced an instance: magnet-mode snapping exists in `chart.js` (`snapToOHLC`, `snapIdx`, crosshair candle-centre snap, `ctrlMagnetSnap`, and a documented `force` override) but its button, dropdown and off/weak/strong selector exist **only** in `legacy-index.html`. The current shell contains zero references to `magnet`, and `magnetMode` initialises to `'off'` — so a shipped, working engine is unreachable by any user.

Same class as the loader finding, one level up: capability loss without failure, at feature level rather than module level. It was detected by a human noticing that muscle memory failed, which is not a repeatable detection method.

**Required:** enumerate the interactive controls in `legacy-index.html` and diff against the current shell. Every control present in legacy and absent in current is either **deliberately retired** — recorded with a reason — or a **migration loss**, which opens a bug row. Mechanical, cheap, and expected to surface more than one silently dropped feature.

## A11. Three managers, continuously parallel (PO directive, 2026-07-27 23:40)

**PO decision: all three managers run in parallel continuously.** Not a staged ratchet. The Director's C-first sequencing preference is withdrawn as a *schedule*; its substance is preserved as *ordering within C's own queue*.

### A11.1 Parallel from now; merges gated, authoring never gated

- **All three managers begin authoring immediately**, each in its own git worktree/branch. No manager works on the integration branch.
- **Manager B may author from minute one but may not merge into integration** until `TERRITORY.yml` and the CI ownership preflight are live. That is hours of work, not days, and it is first in Manager C's queue — so the gate opens the same night and nobody idles.
- **A manager must never idle waiting on anything.** Blocked on review, on a PO test, on another manager's artefact → it emits the appropriate journal entry and continues on other work inside its own territory. If a manager genuinely has nothing left in territory, that is a Director scheduling failure to fix, never a reason to sit idle or to ping the PO.

### A11.2 Manager C's queue is ordered by what it gates

C is simultaneously the cheapest manager and on the critical path twice. Its order is fixed:

1. `TERRITORY.yml` + CI ownership preflight (unblocks B's merges)
2. Build-time module-presence preflight + servable-shell inventory (gates the loader fix)
3. Differential parity oracle per §A7 (gates the canary)
4. Reachability sweep per §A8, negative-control cells, oracle staleness stamping
5. Journal tooling, `BOARD-VIEW.md` generation, per-train digests, soak cell configuration

Items 1–3 are gating. Nothing below them may be started while one of them is incomplete.

### A11.3 Manager B's territory requires an audit before it owns V6

V6's defects concern order-line rendering, hit-order priority, and preview recomputation during drag. If any of that lives in `chart.js` rather than `order-manager.js`, B collides with A immediately. **Cheap-tier audit task, run in parallel now:** enumerate the call sites implementing order-line paint, hit-testing and drag preview, and report which file owns each. If they sit in `chart.js`, either the code moves out before B owns V6, or V6 stays with A. Do not grant the territory on assumption.

### A11.4 Why parallel does not re-jam consolidation

The earlier jam — fixes spread across lineages, heavy rebasing, dirty main worktree — came from everything funnelling through one integration lineage and one deploy surface. Under §A11 that is structurally removed: territory-disjoint diffs cannot conflict by construction, the ownership preflight rejects any diff that would, and A and B deploy to different surfaces (TEST-1 / TEST-2) while C deploys nowhere. The Layer 3 merge lock stays, but merges become trivial rather than archaeological.

The packets-awaiting-consolidation tripwire remains in force as a **measurement**, not as a rollout gate. **Pre-registered threshold, fixed now before it is inconvenient: more than 4 packets awaiting consolidation at two consecutive train boundaries = throttle.** Throttle means managers stop starting new packets and spend the train clearing the queue. It does not mean removing a manager.

## A12. The PO queue — one stream, never three

The PO has directed notification when a test is needed. Implemented as a **single queue**, not as three managers with the PO's attention.

### A12.1 Mechanism

- Managers **never** contact the PO directly and never negotiate for PO time. A manager emits a `PO-REQ` journal entry in its own journal and continues working.
- Tooling generates one **`docs/plan3/PO-QUEUE.md`** from the three journals — Director-ordered, highest-value first. The PO works it top-down whenever available. This is the only surface through which PO verification is requested.
- Each manager's heartbeat leads with its outstanding `PO-REQ` count, so the queue is visible without the PO chasing anyone.

### A12.2 A `PO-REQ` is invalid unless it contains all of

1. **Surface and URL**, and the **exact build ID** the PO must confirm on screen before starting.
2. **Numbered steps**, each with the precise thing to record — a value, a date, a yes/no. Not "check whether it works."
3. **Expected result**, stated before the PO looks, so the PO is confirming a prediction rather than forming a judgement under fatigue.
4. **A time estimate**, and it must be **≤ 15 minutes**. Anything longer is split.
5. **What is blocked on it**, by row, so the PO can see the cost of deferring it.

An invalid `PO-REQ` is rejected by the Director without reaching the PO.

### A12.3 Protections on PO time

- **Gates first, always.** No `PO-REQ` may be emitted until the packet's automated gates and the agent smoke sweep are green (§Part 6 standard). The PO is the last verifier, never the first.
- **Batched by surface.** Multiple requests on the same surface and build are merged into one session so the PO does not reload environments repeatedly.
- **Budget cap: 45 minutes of requested PO time per train, across all three managers combined.** Exceeding it means the Director drops or defers requests — the managers do not get to collectively spend a resource none of them owns.
- **Template of record:** the 2026-07-27 D1–D5 sweep. Numbered steps, one value recorded per step, prediction stated in advance. It produced four defects in ninety minutes, including two the entire automated gate system had missed.

### A12.4 What the PO is for, and what the PO is not for

The PO is the sole business decision-maker, the final verification gate, and — repeatedly now — the source of discoveries no gate produced. The PO is **not** a message bus, not a relay, and not a substitute for an automated check that nobody built yet. Any `PO-REQ` that could have been an assertion is a defect in the gate system, and the Director will treat it as one.

## A13. Managers dispatch, they do not implement (PO directive, 2026-07-27 23:52)

**A manager may not perform the work itself.** Every unit of work is dispatched to a subagent chosen for that task. The manager's own job is decomposition, briefing, territory enforcement, reservation, review reconciliation, provenance, packaging and escalation.

**One carve-out, and it is necessary:** a manager may read code, run read-only inspection, and gather context *for the purpose of writing a competent subagent brief*. Specifying work is not doing it. A manager that cannot read the code cannot write a brief worth dispatching.

**The failure mode to avoid is delegation theatre.** The point is parallelism and tier-appropriate cost, not ceremony. A mechanical one-file change goes to a cheap subagent with a one-paragraph brief, not through full packet ritual.

### A13.1 The manager must not become a rubber stamp

Because the manager no longer authors, its judgement is exercised entirely through review. Therefore: the manager **dispatches a separate adversarial review subagent at top tier** for every packet, and reconciles that review itself. A manager reviewing its own dispatched work with no independent adversarial pass is not review. Per §Part 4 the reviewer is never downgraded.

### A13.2 Model routing — PO preference is the default, with a decidable escalation trigger

Default to the cheap, fast tier: **composer** (`composer-2.5-fast`) and **grok** (`cursor-grok-4.5-medium-fast`). Escalate only on a stated trigger, never on a vague sense of difficulty.

**The escalation trigger is verifiability, not apparent difficulty:** escalate when an undetected error would be expensive **and** no automatic verifier catches it. Where a gate, oracle, test or tripwire converts a mistake into a rejected packet, use the cheap tier — the gate is doing the quality work.

| Task class | Tier | Model |
|---|---|---|
| Audits, greps, file:line inventories, guard-site and control enumeration, timer/listener census | cheap | composer, grok |
| Log parsing, counter tabulation, provenance and digest checks, evidence assembly, docs/checklists | cheap | composer, grok |
| Boilerplate scaffolds, mechanical batch edits | cheap | composer, grok |
| Implementing an already-specced fix; leaf-file changes with narrow blast radius | mid | `gpt-5.5-medium-fast`, `claude-fable-5-thinking-medium` |
| Test, oracle and harness authoring against stated criteria | mid | `gpt-5.5-medium-fast` |
| Adversarial packet review and acceptance | **top** | `claude-opus-5-thinking-high` |
| Architecture design (C3a shapes, scheduler consolidation, session-calendar design) | **top** | `claude-opus-5-thinking-high` |
| Root-cause triage of any surprise or new regression | **top** | `claude-opus-5-thinking-high` |
| Numeric correctness: oracle tolerances, indicator math, anything painted as a value | **top** | `claude-opus-5-thinking-high` |
| Money-path and data-durability code (ledger, migrations, IndexedDB, session backup) | **top** | `claude-opus-5-thinking-high`, `claude-opus-4-8-thinking-medium` |
| Any edit to `chart.js` shared paths (resample, pipeline, replay, indicator, render) | **top** | `claude-opus-5-thinking-high` |

**Model availability correction:** `opus 4.7` is **not available** and must not be substituted for silently. Available: `claude-opus-5-thinking-high`, `claude-opus-4-8-thinking-medium`, `claude-fable-5-thinking-medium`, `gpt-5.5-medium-fast`, `gpt-5.6-sol-low`, `cursor-grok-4.5-medium-fast`, `composer-2.5-fast`. Note `gpt-5.6-sol-low` runs at low reasoning effort — a higher version number is not automatically a higher tier, so route on (model × effort), not on version.

**Escalate on repeat rejection:** two rejections of the same packet → re-author at top tier. Three cheap attempts cost more than one expensive one, and the cost lands in review, which is the real bottleneck.

**No cheap-tier judgement enters the record.** Cheap subagents may gather evidence; classifications, verdicts and dossier facts are top-tier or human.

**Overnight:** cheap-tier sweeps and test authoring only, staged for review. Never merge, never deploy.

### A13.3 Parallel subagents — allowed, with collision rules

Parallelism is encouraged wherever collision is impossible. The manager partitions inside its territory exactly as the Director partitions across territories.

- **Read-only subagents: unlimited parallelism, always.** Audits, inventories, counter reads, log parsing. These cannot collide.
- **Write subagents: parallel only on disjoint file sets.** Two subagents may never hold the same file. The manager maintains the partition and is accountable for it.
- **Same-file work is serialised**, never merged optimistically.
- **Reserve before dispatch.** Kill-switch names, global symbols, storage keys, message names, oracle and fixture names are reserved *before* subagents launch, so two parallel briefs cannot choose the same name.
- **Long-running write work goes in its own worktree.**
- **Cap: 3 write packets in flight per manager.** Read-only work is uncapped. The cap exists because each write packet consumes top-tier review, and review plus consolidation is the binding constraint — see the pre-registered throttle at more than 4 packets awaiting consolidation across two train boundaries (§A11.4).

### A13.3b Routing is measured, not requested (PO observation, 2026-07-28 01:20)

**Observed violation:** all three managers are dispatching effectively everything at top tier. §A13.2 was written as prose with no counter, so it became advisory. This is the same class as the loader defect and TB-6 — a contract with no machine check is a suggestion.

**First, separate the two numbers before judging the mix.** §A13.1 mandates a top-tier adversarial reviewer on *every* packet, so a correct train still shows one top-tier subagent per packet. That part is policy working. The number under audit is the **author tier**, and it must be reported separately from reviewer tier. A manager reporting a single blended figure is not reporting.

**Enforcement, four parts:**

1. **Every dispatch is journalled with its tier.** A `DISPATCH` entry must carry `role=author|reviewer`, `tier=cheap|mid|top`, `model=`, and for any top-tier author `trigger=<clause>`. A dispatch absent from the journal is an unaccepted packet.

2. **Top-tier authoring requires a named trigger clause from the §A13.2 table.** Not a paraphrase, not "high risk", not "to be safe" — the row. **If a manager cannot name the row, the task is cheap tier.** Defaulting upward under uncertainty is the exact drift being corrected: it silently converts a verifiability judgement into a comfort judgement.

3. **Pre-registered expected mix, so deviation is visible rather than arguable.** Across authoring dispatches per train, the standing expectation is a **majority cheap, minority top**. Concretely: **top-tier authoring above 40% of authoring dispatches in a train requires a written justification in the digest.** This is a reporting trigger, not a hard cap — a train that is genuinely all `chart.js` and money-path work may legitimately exceed it, and must say so.

4. **Rejection rate per (task class × model) is reported every train**, as Part 4 already required and none of the three managers is doing. Without it there is no evidence to tune on, so every manager rationally defaults to top tier. **The measurement is what makes cheap tier safe to use.** Upgrade the combinations that bounce; keep the ones that pass.

**Work currently on the board that must be dispatched cheap** (named so the ruling is actionable, not abstract): guard-site enumeration for the `global.X &&` audit (§A4c/Q2); UI control inventory diff (§A10); the reachability sweep's mechanical presence pass (§A8); servable-surface enumeration across the 114 HTML files (§A6); `_mcDiag.resamples` counter tabulation and log parsing; provenance, digest and uniformity checks; evidence-folder assembly; checklist and documentation drafting. These are large, mechanical, and independently verifiable — they are where the cheap tier pays and where a top-tier model is simply slower for the same output.

**Standing rule per §B2:** the digest reports author-tier mix, reviewer-tier mix, top-tier triggers cited, and rejection rate by (task class × model). Absent numbers are treated as a violation, not an omission.

### A13.4 Every subagent brief must state

Task, tier and model with the reason for that tier, the **exact file set the subagent may write**, names already reserved for it, the acceptance criterion, and what it must report back. A brief without an explicit writable file set is invalid, because it cannot be checked against the territory manifest or against sibling subagents.

## A14. Reachability, retention and exposure (Manager C wave 2, 2026-07-28 01:29)

### A14.1 `servable` is derived; `dockerCopy` ratified with a probe tiebreaker

Manager C's narrowing is **RATIFIED**: `dockerCopy` means *a COPY that writes the path into the image's served web-root tree*, not mere presence in an image. C is right that the literal reading is unusable — `Dockerfile.local:93` copies the whole chart tree, which would derive `servable: true` for paths whose GET reaches the 404 raise. **Being in an image is not a route.**

Because this channel now defines what `servable` means, two constraints attach. First, **the channel is conjunctive with the server's own routing**: bytes in the web-root tree plus a server that will actually serve that path — the FastAPI root allowlist for that surface, the nginx root for the homepage image. Either alone is insufficient. Second, **static inference is not the final authority. Where channels disagree, or a row's classification would change a de-routing decision, a live route probe against the built image is the tiebreaker** — an HTTP GET returning 200 is observation; everything else is inference. Record the probe response code and final URL as evidence. This is cheap and it converts the most consequential rows from argument to measurement.

**C's sharpest finding is adopted as a standing rule.** Zero `servable` booleans changed — the booleans were correct and *the status word was lying*. A reader scanning for exposure would have skipped nine routed rows sitting under `excluded`. Therefore: **any human-readable status field must be derived from the same evidence as the machine field, or it must not exist.** A status word that can disagree with its own boolean is a second source of truth, and the gate must go RED on divergence rather than trusting either.

### A14.2 The retain/de-route contradiction — resolved by splitting the copies

C is correct that rulings 2 and 4 cannot both hold for `homepage/public/chart/legacy-index.html`. That contradiction is mine, and it dissolves once the copies are distinguished rather than treated as one thing.

**The §A10 retention obligation attaches to exactly one copy: the chart-root source.** C already established that the harvest must read that copy because `dist/` and `out/` are derived and stale. The served duplicates have no harvest value — they are stale renderings of the artifact we actually need. So: **the chart-root source is retained; every routed copy is de-routed and removed, with no retain obligation.**

**The retain-file assertion keys on a declared `retainPath`, not on the original location.** Moving the canonical copy to a non-served archive path updates `retainPath` and the gate follows it, so the move no longer trips the gate. The assertion that matters is "the harvest source still exists somewhere we declared", not "this file never moves".

### A14.3 STL-1 survives as a conditional exposure assertion, not a fix demand

C identified the real hazard precisely: emptying `requiredModules` was correct reasoning, but it left "legacy references neither `indicator-performance.js` nor `module-presence-runtime.js`" asserted by no live gate, surviving only in a journal — and **a journal is not a gate**.

**Invert the assertion instead of deleting it.** Do not assert *legacy must contain these modules* (a demand to fix a shell we have ruled must die). Assert the exposure conditional:

> **for any shell: if it does not reference the correctness-class required modules, then `routed` must be false.**

The fact stays machine-checked, the RED fires for the correct reason — exposure, not absence — and if anyone re-routes legacy the gate trips immediately. It also generalises: this is a reusable primitive that subsumes per-shell `requiredModules` lists for the retirement case, and it is the assertion §A4c should have carried from the start. Reserve it under a gate name and apply it across the narrow inventory.

### A14.4 Director path grant, and a Director isolation failure

**The grant is landed in `TERRITORY.yml`**: `docs/plan3/*.md` and `docs/plan3/journal/FORMAT.md`, excluding C's exact-pattern artifacts and all manager journals. C was **right to refuse to author a blanket Director exemption** — a manager that can grant the Director relief from policy can grant itself relief by the same mechanism. That refusal is the manifest working as designed.

**The territory violation in `7472228d5` is the Director's, not Manager C's.** C recorded it against itself and kept it RED, which is correct discipline, but the cause was mine: the Director has been editing and committing **inside C's working tree, on branch `manager-c/verification-infra`**. The concurrent stage that swept `MANAGER-A.md` and `MANAGER-B.md` into C's commit was a Director stage. Re-attribute the violation; C's pathspec discipline is a good fix regardless and stands.

The deeper failure is that **the Director violated Layer 0 of its own isolation directive** — every actor works in its own worktree, and I did not have one. This is the second time tonight that governance artifacts were damaged by the Director operating without the constraints imposed on managers. Standing rule: **the Director works in a dedicated worktree on a `director/` branch, and Director commits never land on a manager branch.**

## A15. Presence versus soundness — the sprint's actual pattern (Manager B, 2026-07-28 01:31)

Manager B logged that it had three times "verified that something is present rather than sound", and recorded it as a pattern in its method rather than three slips. **That is not B's personal flaw; it is the single failure mode this entire sprint has been made of**, and it is now named policy:

- The loader defect: the module was *referenced* on the panel, so it was believed *loaded* on the host.
- The manifest: `servable` was *declared* false, so exposure was believed *absent* — nine routed rows sat under `excluded`.
- B's eviction gate: reverting the fix turned the gate RED, which proved the gate *reads the file*, not that it *evaluates the predicate*. It then accepted thirteen of nineteen wrong variants, including `(ol.isPending || true)` — a dead discriminator behaviourally identical to the original bug.

**Standing rule (VER-01): a check that confirms an artifact exists, is referenced, or is textually present does not constitute verification of behaviour, and may not be recorded as one.** Every `VERDICT` must state which of the two it is. "I reverted the fix and the gate went red" is a *wiring* check and must be labelled as such — it is the same test the author already ran, and re-running an author's test is not independent scrutiny.

**Corollary (VER-02): gates that pattern-match text are provisional until proven by mutation.** B's rebuild — parsing each predicate and interpreting it over a closed universe of synthetic rows, comparing removal set against disposal set — is the standard. A gate must be attacked with a case outside its own acceptance suite before it is trusted; B's loose-equality numeric-twin attack is the model. Self-disclosed blind spots are a mark of a sound gate, not a defect in it.

**The adversarial reviewer is hereby permanently non-negotiable.** In its first outing it destroyed a gate the manager had inspected and approved, and overturned the manager's own position on a deferred question. §A13.1 stands without exception.

### A15.1 Cross-territory root causes: specify-and-hand-off, with an ownership question first

V6-P2's mechanism lives in `chart-indicators-full.js` (Manager A's tree); the same undiscriminated-eviction bug lives in `drawing-tools-manager.js` (also A's tree, per TB-1). **B does not receive a write grant for either.** Indicator and drawing modules are correctness-class and single-writer.

**But before hand-off, answer the ownership question B's own framing exposes.** B says: "I can fix which elements obey the rule; I cannot fix the rule." That an order-overlay's visibility is governed by a clip predicate owned by an *indicator* module is a **seam defect, not merely a territory inconvenience**. B must answer, cheap tier: *can the order overlay own its own clip rule?* If yes, B fixes it in territory and the architecture improves. If the predicate is genuinely shared, then **B authors the specification and the evidence, A dispatches the packet in its own tree, and B reviews the result.** Knowledge routes to the owner; the write does not move.

`drawing-tools-manager.js` takes the same route and is mechanical — it is the two-line discriminator B already proved — so it is a cheap-tier dispatch under A per §A13.3b.

### A15.2 Registry invariants are owned by the registry, not by the file

Two independent files corrupting one registry the same way is the clearest possible signal that **file-scoped gates are the wrong scope for a shared-registry invariant**. B built the invariant gate for exactly this reason and correctly reports it cannot reach the second writer.

**Ruling: the eviction-invariant gate transfers to Manager C**, who ships no product code and can therefore range over every writer of that registry regardless of territory. B authored it and remains its technical author of record; C hosts, generalises and maintains it. **Standing rule: where an invariant protects a shared data structure, the gate is verification-infrastructure and belongs to C, scoped to the structure and not to any territory.**

### A15.3 RED-first is not waived; the instrument is procured

B is right that this is a Director decision and right to surface it now rather than at consolidation. **RED-first stands.** The whole V6 family is DOM/D3/rAF-bound and unloadable in Node, so the answer is an instrument, not an exemption: **Manager C adds a browser-hosted runner for order-overlay behaviour to its harness.** Precedent and parts already exist in tree under `m21-w6-fixtures/browser-preflight/`, including the pinned-Chrome fallback settled earlier tonight.

**B's demotion of B-W3 off the `.red.` convention is exactly right and becomes a standing rule (VER-03): the gate naming convention is a claim, and a harness that cannot fail on a product regression may not wear it.** A transcription of a mechanism is a specification; call it one.

**Interim:** V6 gates are structural only, and every structural gate must be stamped as not-behaviour-covering per §A4b, so no verdict can later be read as behavioural.

### A15.4 The agent smoke sweep standard, defined now so it stops blocking

B held PO-REQ at zero rather than emit non-compliant requests — correct discipline, and the missing standard is my omission. It is: **(1)** the build deploys and the tripwire confirms the expected stamp; **(2)** host and panel both paint; **(3)** no console errors at boot; **(4)** the row's own precondition log line is observed. That is the bar for a PO-REQ, not a full sweep.

**Note the convergence:** once §A15.3's browser runner exists, both of B's blocked observations — V6-P1's ignition log line and the V8 pin lifecycle — become **agent-executable, and require no PO at all.** The instrument that unblocks RED-first also removes the PO from the loop. This raises C's runner above its queue position.

## A16. Train-3 rulings (2026-07-28 08:35)

### A16.0 The Director's leading hypothesis is falsified — recorded, not quietly dropped

On 2026-07-27 I promoted "the indicator lag is a data effect caused by stale completed-bar closes" to leading hypothesis for the lag family, on the strength of the D2/D3 monotonic scaling. **Manager A falsified it overnight.** TAL-01918 is a **presentation defect** — a wrong-window/unmarked-forming-candle problem — not a value mutation; the row is renamed accordingly, and the separate lag probe (P4) was withdrawn at 04:07 after being rewired through `getDisplaySeries`.

**The lag family is therefore still open with no leading hypothesis, and that is the honest state.** Recorded here because a Director hypothesis that quietly evaporates is how a corpus rots — the same failure as an unstamped closure. A's retraction of its own attribution and identity claims at 04:30 is the standard.

### A16.1 Journal grants — TERR-F4 closed

The `journals:` block conferred append-only *rules* but no *write right*, so Managers A and B held no positive grant to their own journals while C did. **Granted in `TERRITORY.yml`.** C was correct to block rather than infer this, and correct not to author it.

**Standing rule: a rule that constrains how a path may be written is not a grant that it may be written.** Every path a manager must write needs an affirmative owner entry. Absence is RED by fail-closed default, which is working as designed.

### A16.2 The gate must not overclaim — TERR-F3 closed

C's ACCEPT-WITH-FIXES correctly identified that the manifest header claimed Director-only governance while the `Manager:` trailer is self-declared and spoofable. **C's honest header rewrite is ratified**, and the manifest now states plainly what it enforces and what it does not.

This is **VER-01 turned on our own instruments**: a gate that documents a guarantee it cannot enforce is making a presence claim dressed as a soundness claim. The two controls that are real — base-commit manifest governance, and Director commits confined to a `director/` branch — are named; deliberate trailer forgery is declared a trust boundary rather than implied away. **Standing rule: gate documentation is held to the same evidentiary standard as gate output.**

### A16.3 Daily-bar provenance is a code question, not a PO question

A must not idle on this. **Whether our daily bars are native provider bars or locally resampled from 1m is answerable by reading the fetch path — dispatch it cheap tier and answer it in the tree.** Only the *convention* is a PO decision, and it is pre-answered so the fix can proceed either way:

**Authoritative session specification, supplied by the PO 2026-07-28 10:00. This is domain ground truth, not a Director inference — build the calendar against it.**

| Class | Weekly open | Daily boundary | Weekly close | Break |
|---|---|---|---|---|
| **FX** | Sunday **17:00 ET** | 17:00 ET Mon–Thu (value-date roll) | Friday **17:00 ET** | none — continuous |
| **Futures (CME Globex)** | Sunday **18:00 ET** | 18:00 ET → 17:00 ET next day | Friday **17:00 ET** | **17:00–18:00 ET daily maintenance halt, Mon–Fri** |
| **Crypto** | continuous | 00:00 UTC | continuous | none |

**My earlier note said futures roll at 17:00 ET. That was wrong** — futures *close* at 17:00 and *reopen* at 18:00, with a 60-minute matching-engine halt between.

**Four consequences that constrain the implementation, and the first two make a shared constant impossible:**

1. **An FX daily bar spans 24 hours; a futures daily bar spans 23.** FX runs 17:00→17:00 with no break; futures run 18:00→17:00 with an hour halt. **No single fixed duration buckets both correctly**, which is precisely why `Math.floor(t / 86400000)` cannot be repaired by changing the constant. The calendar must define boundaries, not durations.
2. **"17:00 ET" is not a fixed UTC offset.** ET is UTC−5 in winter and UTC−4 in summer. A millisecond offset would be correct for half the year and an hour wrong for the other half, twice per year, with the error landing on session boundaries. **DST must come from a timezone database, never from an offset constant.** This is the single most likely way a "fixed" calendar silently re-breaks.
3. **The futures maintenance hour is a real gap and must not be filled.** No bar may be synthesised for 17:00–18:00 ET. A bar that exists there is the same class of fiction as the phantom Saturday.
4. **Re-derive the phantom-Saturday mechanism against this spec rather than carrying the earlier guess.** FX closes Friday 17:00 ET, which is Friday 21:00 or 22:00 UTC depending on DST — so there is no Saturday trading to bucket at all, and UTC-midnight flooring alone does not obviously produce a Saturday bar. Something else is contributing, most likely a mismatch between the timezone used to *bucket* and the timezone used to *label*. Per BRIEF-02 this is briefed as a hypothesis with a refutation criterion, not as a finding.

### A16.3b PO answers, and the design they force (2026-07-28 10:08)

**Settled by the PO:** daily bars show **ETH (electronic hours)**, not regular trading hours. Canary instruments are **NQ, ES and GC** — all CME futures — alongside the existing forex symbols. **The product carries both classes, so classification is not optional.**

**The PO adds a fact that decides the architecture: futures bank holidays produce sessions far shorter than 23 hours**, including early closes and full closures.

**Therefore: sessions are anchored by rule and their existence is determined by data, never by duration.**

1. **Boundaries come from the rule** — FX 17:00 ET, futures 18:00 ET, crypto 00:00 UTC, resolved through a timezone database so DST is handled rather than approximated.
2. **Session existence and length come from the observed data.** If the feed has no ticks in a window, there is no session and **no bar is emitted.** This single rule handles the futures maintenance hour, early closes, full bank-holiday closures and weekends **with no holiday calendar to source, ship or maintain** — which matters when the deadline is 46 hours away and a CME holiday table for three contracts is data we do not currently hold.
3. **Standing invariant: never synthesise a bar with no underlying ticks.** This is the assertion that kills the phantom Saturday regardless of which mechanism produced it, and it is cheap and testable. It is also the general form of the defect class: our chart has repeatedly asserted the existence of things it had not observed.

**Symbol classification, with a named trap.** Class must be derived per symbol, and **spot versus futures gold is the trap that will catch us**: `XAUUSD` is spot and rolls at **17:00 ET**, while `GC` is a CME future and rolls at **18:00 ET**. Both are "gold" and they are one careless mapping away from being treated alike. Unknown symbols fall back to the FX calendar — the larger population — but the fallback **logs loudly** rather than degrading silently, per §A4c.

### A16.3c The PO's drift hypothesis — briefed per BRIEF-02, with the discriminating test named

The PO's hypothesis: because the code assumes a 24-hour day while the real session is shorter, each day takes a bite of the next day's hours, drift accumulates through the week, Friday is left with too few hours and gets dropped.

**Partly right, and right about the thing that matters.** The substance — an assumed 24-hour day against a session that is not 24 hours — is exactly the defect. But the mechanism depends on how bars are bucketed, and the two possibilities give different symptoms:

- **If bars are bucketed by flooring** (`Math.floor(t / 86400000) * 86400000`, which is what `_resampleDataFull` and `_tryIncrementalResample` do), **drift cannot accumulate** — every bucket lands exactly on UTC midnight regardless of session length. The PO's mechanism does not apply to this path.
- **If any path builds bars by counting forward** from a first bar ("every 1440 minutes from the start"), **the PO's mechanism is exactly correct** and drift accumulates precisely as described. **Confirm no count-forward path exists** — this is a cheap, decisive audit and it must be run rather than assumed.

**The single fact that determines everything, and it must be established before any mechanism is proposed: what timezone are the raw feed timestamps in?** Forex feeds commonly arrive on broker server time (UTC+2 or UTC+3), not UTC. If timestamps are broker-time while the flooring treats them as UTC, then Friday 17:00 ET — 21:00 UTC — becomes **Saturday 00:00 in broker time** and the last hours of Friday's session floor into a Saturday bucket. **That would produce a small phantom Saturday bar as a direct arithmetic consequence**, and it is currently the leading candidate. It is a hypothesis with a refutation criterion, not a finding: establish the timestamp timezone first, then derive the symptom, then check it against the observed chart.

**Refutation criteria, stated in advance:** the broker-time hypothesis is refuted if raw timestamps are UTC and the phantom Saturday still appears. The count-forward hypothesis is refuted if every bucketing path floors. If both are refuted, the mechanism is in labelling rather than bucketing, and the next probe is the display timezone.

**Weekly boards now.** Daily boards as soon as the provenance audit reports; if the bars are native, we match the provider's stamping and disclose it, and if they are derived, we bucket to the class calendar above. DST is handled by the calendar, never by a fixed millisecond offset — that is the defect being removed.

### A16.4 Rejection attribution — a manager's own defect does not escalate its author

A asked whether a rejection caused by the manager's own false finding or defective brief counts toward §A13.2's two-rejection author escalation. **It does not.** The escalation exists to detect *insufficient author tier*; when the cause was a bad brief, the author tier was never the problem, and escalating it routes on the wrong signal — the same measure-the-wrong-thing error this sprint keeps producing.

**But it is not a free pass.** Rejections are attributed to cause and counted in separate columns: `author-defect`, `brief-defect`, `manager-finding-defect`. Only `author-defect` counts toward escalation. **Three manager-caused rejections in one train triggers a top-tier review of the manager's next brief before dispatch** — the manager's own decomposition becomes the thing under review, which is the correct instrument for that failure mode. Report all three columns in the digest per §A13.3b.

### A16.5 The ungated-file rule that A discovered by applying it to itself

A held two accepted product fixes out of TEST-1 because `drawing-tools-manager.js` has no automated gate at all, refusing to call the chain automated-GREEN on the strength of thorough reviews. **That judgement is ratified and generalised: review confidence is not gate coverage, and a file with no gate cannot be part of an automated-GREEN chain regardless of how well its diff was reviewed.** Closing that gate gap is the highest-priority item standing between merged work and a deploy.

## A5. Test-integrity policy (anti-lying-gate)

Mandatory for **money-path (D-030), data-integrity, and headline-mechanism** gates; recommended elsewhere.

1. **Permanent negative-control cells in CI.** Every covered gate keeps a paired cell running with the relevant kill-switch OFF, asserting RED. *A gate whose negative control is green is a lying gate.*
2. **Ungated cures (the `852420adc` class) use the fault-injection scaffold** (`m21-2-candle-scaffold-fault-injection.mjs`) in place of a kill-switch. This is a rule, not a discovery to be made later.
3. **Four-state proof at RED authoring** (one page in the packet): fails on broken state; passes on fixed state; fails when its input is deliberately corrupted; flips when the assertion is inverted.
4. **3× repeat at authoring, plus one run on a different clock/host.** Move the 10/10 × 3-builds instrument from consolidation-time to authoring-time.
5. **Oracle provenance + staleness stamping.** Each oracle records the build and mechanism row it was authored against and "last proven RED on <build>". An oracle that has not demonstrated a failure within N builds is marked **UNPROVEN**, which is not GREEN.
6. **Structural ban on nondeterministic inputs inside assertion payloads** — no UUIDs, wall-clock timestamps, rAF ordering, float equality. Authoring-checklist line; lint rule if cheap.

---

# Part B — Delivery-velocity rulings

Framing: **the brakes were built when the failure mode was bad GREENs; the failure mode now is undelivered fixes. Brakes are not weakened — they are priced by risk.** Uniform ceremony is rigor misallocated.

## B1. The PO leaves the relay path

**The Manager dispatches workers directly**, within the existing file-ownership matrix. (Largely ratifies current practice — the overnight protocol already ran without message-carrying.)

- **Escalate to Director/PO only for:** money-path (D-030), cross-lane file-ownership conflicts, changes to acceptance criteria, anything I16-relevant, any packet rejected twice, and business decisions (promotion, product ceilings, risk pricing).
- **PO receives a per-train digest** — what shipped, what is queued, what escalated — not per-message involvement.
- Unchanged: worker prompts remain self-contained; PO visual scripts stay ≤2 minutes with build id confirmed first; QA sessions/orders only under dedicated QA account ids, never admin or real-user accounts.
- **Operational caveat:** direct dispatch increases parallel agent load. If API-capacity limits bite, reduce lane parallelism rather than queue-thrashing, and report it in the train digest.

## B2. Every ruling ships with a standing rule

When a case-by-case ruling is issued, it ships with a one-paragraph standing rule so the class never returns (the baseline-retained-failure category is the model). Case-by-case rulings that do not generalise are recorded as exceptions with a reason.

## B3. Three change tiers

Tier is proposed by the Manager, confirmed by one Director line, and **auto-promotes on bad behaviour**.

**Tier 1 — FAST LANE.** Qualifies only if ALL hold: isolated per the file-ownership matrix (no `chart.js`, no shared pipeline); **kill-switched with a demonstrated switch-OFF cell in the packet** (a declared switch is not a switch — see `852420adc`); not money-path / data-integrity / I16; RED→GREEN evidence present; regression test ships in the packet.
*Never dropped (the floor):* full provenance chain (tag → digest → tripwire), working kill-switch, RED→GREEN artefacts, CI green including relevant negative controls, pinned rollback, **one independent review pass by an agent other than the author**.
*Dropped:* bundle assembly (rides any train); multi-round adversarial review; sealing requalification duplicating automated checks; **pre-deploy PO eyes — PO verification moves post-deploy, batched** into the next scheduled window. The proven kill-switch is what makes post-hoc verification safe.

**Tier 2 — STANDARD.** Shared-path or multi-file changes, new mechanism rows, anything two lanes touch. Current ceremony minus redundancy: one review round unless the reviewer requests a second; sealing checks that duplicate CI are dropped.

**Tier 3 — HEAVY.** Money-path (D-030), data integrity/migrations, I16-relevant, architecture (M21 increments), anything ungated. Full ceremony + negative-control/four-state proof + PO pre-deploy verification + reporter re-verification where a named tester filed it.

*Calibration examples:* the open-trade duration-clock bug is Tier 1; M24's ID grammar is Tier 3.

**Anti-abuse:** any Tier-1 fix that is reopened, regressed, or switch-disabled **auto-promotes its whole area to Tier 2 for the next 3 builds**. If Tier-1 recurrence is not ~zero on the weekly metric, the tier's entry bar rises. Recorded in every checkpoint report.

## B4. Deploy trains

**Two trains per day**, anchored to the PO's two batched verification windows (morning / evening).

- **Trains never wait.** A fix that is not ready when the train leaves takes the next one. No holding — holding is how a train becomes a bundle again.
- **Boarding:** Tier 1 boards any train; Tier 2 boards with review complete; Tier 3 boards designated trains only, with its soak served and PO pre-verification done. Nothing boards without the provenance floor.
- Completion-gated bundles are retired as the default (B77's four mutually hostage fixes are the standing exhibit).

## B5. Second deploy target (TEST-2)

TEST-2 takes consolidation candidates, soaks, and parked builds; **TEST-1 remains the PO's stable verification surface.** A parked build must never block the board again.

**Build requirement (Director condition):** TEST-2 must **not share a database with TEST-1** — its own database, or at minimum its own schema with QA-only account ids. Shared persistence would let soak and candidate runs write trades/sessions into the PO's verification surface, which is a data-integrity hazard while M24's ledger grammar and alias migration are in flight, and an I16 exposure. Confirm resource feasibility (ports, memory, DB isolation) before standing it up; report if the host cannot carry it.

## B6. Expected effect (stated so it can be measured)

The duration-clock class of fix should become **same-day routine**. A three-consolidations-zero-deploys day should become structurally impossible. Every deploy still carries the full provenance chain, every fix still carries RED→GREEN, no reviewer is ever downgraded, and the gates that stopped B76/B77/B78 still stand — they charge by risk instead of a flat rate.

Metric to report weekly: median hours from fix-accepted to PO-verified-on-TEST, plus Tier-1 recurrence count.
