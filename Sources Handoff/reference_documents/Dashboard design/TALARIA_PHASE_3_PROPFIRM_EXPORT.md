# Talaria Dashboard — Phase 3 (Prop Firm, Export & Finish)

> **For: Codex.** This is the final build phase. Phases 1-2 delivered the shell, primitives, data layer, and the first six navigation categories. **Phase 3 completes the dashboard**: the **PROP CHALLENGE** category (challenge configurator, rule compliance, pass probability & simulation, variation optimizer, daily-limit optimization — available across modes), the **LIVE DISCIPLINE** category (discipline filter & score, Demon Catcher, plan-adherence equity), the **STRATEGY SOURCE** category (reconciliation + attribution), the **EXPORT** category, full prop/live/strategy wiring across the app, and the final cross-cutting polish.
>
> Do not rebuild or restyle Phases 1-2. Reuse everything. This phase un-greys the last four categories and finishes the cross-cutting features stubbed earlier. The companion reference PDF shows the intended look.

---

## Phase 3 scope

| Build in Phase 3 | Already built (Phases 1-2) |
|---|---|
| **PROP CHALLENGE** category (5: Configurator, Rule Compliance, Pass Probability & Simulation, Variation Optimizer, Daily Limit Optimization) | Shell, primitives, data layer, `metrics.ts`, workers |
| **LIVE DISCIPLINE** category (3: Discipline Filter & Score, Demon Catcher, Plan-Adherence Equity) | ESSENTIALS, EXCURSION |
| **STRATEGY SOURCE** category (2: Source Reconciliation, Source Attribution) | WHAT-IF, STATISTICAL, PATTERNS, STRATEGY HEALTH |
| **EXPORT** category (2: Report Builder, Comparison View) | Monte Carlo (prop-challenge tab placeholder) |
| Prop-challenge wiring (1-step/2-step, futures/forex), Live discipline + Demon Catcher, Strategy reconciliation | All computed metrics + Web Workers |
| Compare mode · Mentor share links · Final polish: a11y, perf, RTL | |

**Gating recap (from the master spec):** PROP CHALLENGE is *prop-aware* — shown by default in Prop mode, opt-in in Standard/Strategy (once a challenge is configured), auto-on for Live prop accounts. LIVE DISCIPLINE shows only when source = Live. STRATEGY SOURCE shows only when source = Strategy. EXPORT is always available.

---

## 1. Full prop / live / strategy wiring

Phases 1-2 left these source behaviors stubbed. Phase 3 makes them first-class.

### 1.1 Populate the deferred Session/Trade fields

Implement the full contracts from the master spec:
- **`session.propChallenge`** — assetClass (futures/forex), structure (1-step/2-step/instant), firmPreset, accountSize, and a **per-phase rules array** (profitTargetPct, dailyLossLimitPct, maxDrawdownPct + **drawdownType: static / trailing / eod-trailing**, min/max trading days), plus consistencyRulePct, weekend/news toggles.
- **`session.propFirmStatus`** — currentPhase, result, failedRule, failedPhase, daysToHitTarget.
- **`session.accountType`** (`'private' | 'prop'`) for Live sessions.
- **Trade.`planAdherence`** (`according-to-plan | out-of-plan | missed-trade`), **Trade.`hypotheticalRr`** (for missed-trade rows), **Trade.`demons[]`**.
- **`session.disciplineScore`**, **`session.demonLog`**.
- **`session.mergedSources`** (members, tagMap, instrumentMap, dateRangeMode, normalization, conflicts) — see master Section 1.6.

### 1.2 New computed metrics (`/utils/`)

- **dailyRuleUtilization(session)** → per trading day: cumulative daily loss %, max DD used % (respecting static vs trailing vs EOD-trailing drawdown), profit-target progress %, near-miss flags (>50%), breach flags. Phase-aware for 2-step.
- **passProbability(session)** → Monte-Carlo the trade distribution against `propChallenge`; return pass %, failure-cause breakdown, **per-preset results** (FTMO / MyForexFunds / The5ers / FundedNext / Topstep / Apex), and **combined 2-step probability** P(phase1) × P(phase2 | phase1).
- **ruleSensitivity(session, ruleKey, delta)** → "if daily limit were 4% instead of 5%, fails on day N".
- **dailyLimitOptimize(session, upperPct, lowerPct)** → re-walk day by day, stop each day at first limit crossed; Original vs Optimized P&L, win rate, days saved, improvement %, risk reduction %. Worker-backed.
- **variationOptimize(session, axis, ranges)** → cartesian sweep over **strategy variations** (risk %, TP/SL via the excursion replay engine, session filter, setup subset, max trades/day) and/or **challenge variations** (firm preset, account size, 1-step/2-step, futures/forex); each combination re-simulated against the rules; returns pass probability + expectancy per variation. Worker-backed; cap grid size and warn on large sweeps.
- **disciplineScore(trades)** → from the planAdherence distribution (according-to-plan rewarded; out-of-plan and missed-trade penalized, missed-trade weighted by `hypotheticalRr`).
- **planAdherenceEquity(trades)** → two equity series: Actual (realized) and Strategy (perfect adherence: include missed-trade hypothetical R, exclude out-of-plan trades).
- **reconcile(session.mergedSources)** → apply tagMap/instrumentMap, compute effective date range per mode, normalize scale, surface conflicts (master Section 1.6).
- **sourceAttribution(trades)** → decompose aggregates by `originSource`; backtest-vs-live divergence series.

### 1.3 Activate dormant overlays in already-built components

- **Daily P&L Heatmap** (Phase 1): red cell border when a rule was near-breached that day (>50% utilization), solid red fill if breached. From `dailyRuleUtilization`.
- **Monte Carlo & Pass Probability** (Phase 2): replace the "prop challenge required" placeholder with live rule-line overlays (daily loss, max DD respecting drawdown type, target) + the full Pass Probability gauge + preset comparison + 2-step toggle.

---

## 2. Phase 3 components

### 2.1 PROP CHALLENGE (prop-aware — default in Prop mode; opt-in in Standard/Strategy; auto-on for Live prop accounts)

**Challenge Configurator** `challenge-configurator` · the gate that turns the category on
- Setup panel: **asset class (Futures / Forex)**, **structure (1-step / 2-step / instant)**, **firm preset** (FTMO / MyForexFunds / The5ers / FundedNext / Topstep / Apex / Custom — preset fills editable rules), **account size**, **per-phase rules** (profit target %, daily loss limit %, max drawdown % + **drawdown type: static / trailing / EOD-trailing**, min/max trading days), consistency rule %, weekend/news toggles.
- Behavior: futures presets default to trailing/EOD drawdown + intraday conventions; forex presets default to static. 2-step exposes Phase 1 + Phase 2 separately. Saving writes `session.propChallenge` and **activates the rest of the category for the current source** (so a Standard/Strategy user opts in here; a Prop user sees it pre-filled).

**Rule Compliance & Utilization** `rule-compliance` · needs a configured challenge
- **Status banner:** PASS / FAIL / IN PROGRESS + specific rule + date + **which phase**.
- **Rule Compliance table:** one row per rule. Columns: Status, Worst Day, Closest Call (% of limit), Times Breached, Margin. Color-coded.
- **Rule Utilization Timeline:** stacked area — daily loss budget used (red, resets daily), total DD headroom (red, decreasing; **respects static vs trailing vs EOD-trailing**), distance to profit target (green). Phase selector for 2-step.
- **Sub-window:** per-rule timeline + near-miss calendar heatmap + rule sensitivity + "days you should have stopped trading".
- Data: `propChallenge`, `propFirmStatus`, `dailyRuleUtilization`, `ruleSensitivity`. The drawdown engine must track running peak per the configured drawdown type.

**Pass Probability & Simulation** `pass-probability` · needs a configured challenge
- **Large radial gauge:** overall pass %.
- **Failure-cause breakdown:** ring of why simulated runs fail (daily loss / max DD / didn't hit target / didn't meet min days / consistency rule).
- **Recommendations** + **preset comparison** (FTMO / MyForexFunds / The5ers / FundedNext / Topstep / Apex side by side) + **1-step vs 2-step toggle** showing combined probability P(phase1) × P(phase2 | phase1).
- **Scenario sliders** (risk %, win rate, avg R) re-run live in the worker.
- Data: `passProbability` (Monte Carlo over `propChallenge`).

**Variation Optimizer** `variation-optimizer` · needs a configured challenge ⭐
- Answers "which variations reach the goal?" along a switchable axis:
  - **Vary Strategy:** sweep strategy parameters (risk %, TP/SL via the excursion replay engine, session filter, setup subset, max trades/day) pulled from the Strategy Builder + dashboard filters; rank every variation by pass probability + expectancy; highlight those crossing the pass threshold.
  - **Vary Challenge:** hold the strategy fixed, sweep the challenge (firm preset, account size, 1-step/2-step, futures/forex) to show **which evaluations this strategy could pass**.
  - **Both:** a grid (strategy variation × challenge) of pass probabilities.
- Chart: sortable results table + pass-probability heatmap (gold-starred cells above threshold) + "best variation" callout.
- Data: `variationOptimize` (worker). Cap grid size; warn on large sweeps.
- Why: directly answers "what do I change to pass?" and "which challenge should I attempt?"

**Daily Limit Optimization** `daily-limit-optimization` · most useful with a challenge; lighter Standard variant ⭐
- **Two sliders:** daily profit target + daily loss limit (% or $).
- **Re-simulation:** re-walk day by day; once a day crosses either limit, skip the rest of that day's trades.
- **Original vs Optimized panels:** Total P&L, Win Rate, Improvement %, Days Saved, Risk Reduction %; percentage equivalents by account size.
- Data: `dailyLimitOptimize` (worker).
- Why (last year's standout idea): most blown evaluations come from one bad day where the trader kept going. Quantifies how a hard daily stop would have saved the account and lifted pass probability.

### 2.2 LIVE DISCIPLINE (only when active source = Live)

**Discipline Filter & Score** `discipline-filter` · Live only
- Every live trade must carry `planAdherence` (**According to plan / Out of plan / Missed trade**), set at journaling time; **enforce on import** — untagged live trades are flagged for the user to classify.
- Chart: donut of the three categories + a **Discipline Score (0-100)** from the distribution (according-to-plan rewarded; out-of-plan and missed-trade penalized, missed weighted by `hypotheticalRr`) + a score-over-time trend.
- Data: `disciplineScore(trades)`.

**Plan-Adherence Equity (Actual vs Strategy)** `plan-adherence-equity` · Live only
- Two overlaid equity curves: **Actual** (realized) vs **Strategy** (perfect adherence — includes missed-trade hypothetical R, excludes out-of-plan trades). Shaded gap = the cost of deviations. Stat cards: "Deviations cost you $X / Y R", "Missed trades cost $Z", "Out-of-plan net $W".
- Data: `planAdherenceEquity(trades)` from `planAdherence` + `hypotheticalRr`.

**Demon Catcher** `demon-catcher` · Live only ⭐ (Talaria's take on Tom Dante's Demon Finder)
- Concept: track how often the trader commits each common error ("demon"); kill the worst one first, then the next. Default demons: Poor R:R · Entered too soon · Entered too late · Exited too soon · Exited too late · Trade not in plan · Bet too large · Bet too small · Didn't take planned trade · Moved SL to BE then stopped · Faded the daily bias · No plan / punted. Editable in settings.
- **Unique, visually appealing UI (NOT a spreadsheet):** each demon is a **card on a dark "arena"**, sized/intensified by how often it's been committed — the worst demon looms largest and glows red. Tapping a demon on a trade adds a check and fills its "health bar". A **most-active demon** is spotlighted as the "boss to slay next." A demon that goes N trades without recurring visibly **fades / dies** with a satisfying state change. **Streak warning** if the same demon recurs 8 times in a row ("this one runs deep — consider stepping back"). A **Survival → Growth → Consistency → Profitability** progress rail frames the view. Tasteful and motivating, never punitive.
- Data: per-trade `demons[]`, `session.demonLog`. Clicking a demon lists its trades (with screenshots/notes); a "kill log" shows demons conquered over time.

### 2.3 STRATEGY SOURCE (only when active source = Strategy)

**Source Reconciliation** `source-reconciliation` · Strategy only
- The control room for the merge (master Section 1.6). Sections: member list (source + trade count + date-range coverage bar), **tag-mapping table** (raw → canonical, unmapped flagged), **instrument-mapping table**, **date-range mode** (union / intersection / custom) with effective-range readout, **normalization** (R-multiple / % / none) with scale-mismatch warning, **currency** handling, and a **conflict panel** with resolve actions.
- Behavior: cross-source components stay gracefully degraded (banners, hidden sub-visuals) until conflicts resolve — never show wrong numbers.
- Data: `session.mergedSources`; `reconcile()`.

**Source Attribution Breakdown** `source-attribution` · Strategy only
- Decompose any aggregate by `originSource` (stacked bar / waterfall: "of +$8,340: Standard +X, Prop +Y, Live +Z") + a **backtest-vs-live divergence** panel (same strategy across sources: overlay normalized equity curves, quantify divergence; ties into Discipline) + per-source mini KPI cards.
- Data: `sourceAttribution(trades)`; reconciled/normalized values.

### 2.4 EXPORT (sources: all)
### 2.2 EXPORT (sources: all)

**Report Builder** `report-builder`
- **Templates row:** Mentor Review / Prop Firm Application / Self-Review / Custom.
- **Page selector:** checkboxes for which components to include.
- **Card-level selector:** granular checkboxes within each chosen component.
- **Cover-page options:** title, trader name, session name, date range, summary text.
- **Export format:** PDF / HTML / Image gallery.
- **Live preview pane:** renders the report as configured.
- **Generate button.**
- Data: read access to all rendered components + an HTML-to-PDF render path. Respect the active View Mode and filters in the output.

**Comparison View** `comparison`
- **Pick Session A and Session B** (any two sessions/sources — especially the same strategy as Standard vs Prop Firm to reveal what the rules cost).
- **Overlaid equity curves** on one chart, two colors (not two separate charts).
- **Delta column** down the middle: the difference for every metric, color-coded (green if A better, red if B better).
- **Diff heatmaps** for time-of-day and day-of-week (green where A wins, red where B wins).
- **Common-vs-unique trades** indicator for overlapping periods.
- **Statistical significance** indicator (p-value via paired test) for the expectancy difference.
- Data: two `Session` objects loaded simultaneously.

---

## 3. Cross-cutting features

### 3.1 Compare mode (enable the top-bar Compare button)

The Compare button has been disabled since Phase 1. Enable it now. Clicking it lets the user pick a second session; the dashboard enters a split/overlay state. Where a component supports comparison (equity curve overlay, Strategy Radar ghost polygon, KPI deltas), show both. The dedicated Comparison View (2.2) is the full-page version; Compare mode is the inline lighter version usable from any component.

### 3.2 Live freshness indicator

For the Live source, show a freshness indicator in the top bar ("Updated 12s ago" / "Live") so the trader knows the journal is syncing. Ties to the real-time-journal architecture (EA → VPS → 30s poll). Adopted from last year's "Auto-updating every 30s" label. Hook was added to the shell in Phase 1; wire it to the actual Live sync state here.

### 3.3 Mentor share links

Given Talaria's mentorship business, add the ability to generate a **read-only share link** for the current view (or a Report Builder output). The link encodes source + session + active component + filter state in the hash route, plus a `readonly=1` flag that hides editing affordances. A mentor opening the link sees exactly what the student saw. (If real auth/sharing backend isn't ready, generate the encoded URL and copy it to clipboard; flag `// TODO: backend share endpoint`.)

### 3.4 Final polish pass

- **Accessibility:** side-nav is a `role="navigation"` landmark; nav items are buttons with aria-labels; active component announced to screen readers; full keyboard navigation (Tab through items, Enter to activate, Arrow keys to move); visible focus indicators everywhere.
- **RTL audit:** every component across all ten categories — layout mirrors, charts and digits do not.
- **Performance hardening:** confirm filter changes re-render within 200ms at 5,000 trades; all simulations in Web Workers with progress + cancellation; lazy-render on scroll; memoization holds; 60fps on scroll and filter.
- **View-Mode audit:** Dollars / % / R / Pips / Ticks / Privacy correct on every monetary display in every component.
- **Empty/error states:** every component degrades gracefully on missing fields with a small "data not available" note; zero console errors on any navigation path.

---

## 4. Phase 3 build order

1. Populate the deferred contracts (`propChallenge` incl. per-phase + drawdown type, `accountType`, `planAdherence`/`hypotheticalRr`/`demons`, `disciplineScore`/`demonLog`, `mergedSources`); build the new `/utils/` functions (dailyRuleUtilization, passProbability, ruleSensitivity, dailyLimitOptimize, variationOptimize, disciplineScore, planAdherenceEquity, reconcile, sourceAttribution).
2. Activate dormant overlays (Daily P&L Heatmap near-breach; Monte Carlo rule lines + pass-probability).
3. PROP CHALLENGE category: Challenge Configurator first (it gates the rest), then Rule Compliance, Pass Probability & Simulation, Variation Optimizer, Daily Limit Optimization.
4. LIVE DISCIPLINE category: Discipline Filter & Score, Plan-Adherence Equity, Demon Catcher.
5. STRATEGY SOURCE category: Source Reconciliation first (it gates valid merged views), then Source Attribution.
6. EXPORT category: Comparison View, then Report Builder.
7. Enable Compare mode + inline comparison affordances; mentor share links; Live freshness indicator.
8. Final polish pass (a11y, RTL audit, performance, View-Mode audit, empty/error states).
9. Un-grey PROP CHALLENGE (prop-aware), LIVE DISCIPLINE (Live-only), STRATEGY SOURCE (Strategy-only), and EXPORT in the nav.

## 5. Phase 3 acceptance criteria

- **Challenge Configurator** writes `propChallenge` and gates the rest of PROP CHALLENGE; supports 1-step/2-step and futures/forex with the correct drawdown-type defaults; works in Standard/Strategy (opt-in) and auto-on for Live prop accounts.
- **Rule Compliance & Utilization** correctly tracks static vs trailing vs EOD-trailing drawdown and is phase-aware for 2-step; near-miss days flagged.
- **Pass Probability & Simulation** reports pass % + failure-cause breakdown + preset comparison (FTMO / MyForexFunds / The5ers / FundedNext / Topstep / Apex) + combined 2-step probability; completes < 5s.
- **Variation Optimizer** sweeps strategy variations AND challenge variations, ranks by pass probability, highlights variations above threshold; worker-backed with grid-size caps.
- **Daily Limit Optimization** reports Original vs Optimized + Improvement % + Days Saved + Risk Reduction %; lighter Standard variant works.
- **LIVE DISCIPLINE** (Live only): untagged live trades enforced to be classified; Discipline Score computed from planAdherence; Plan-Adherence Equity overlays Actual vs Strategy and quantifies the deviation cost; **Demon Catcher** renders the arena UI (sized cards, boss spotlight, fade-on-death, 8-in-a-row streak warning, Survival→…→Profitability rail) — not a spreadsheet.
- **STRATEGY SOURCE** (Strategy only): Source Reconciliation maps tags/instruments, handles date-range mode + scale normalization + currency, lists conflicts, and degrades cross-source views gracefully until resolved; Source Attribution decomposes aggregates by originSource and shows backtest-vs-live divergence.
- **EXPORT**: Report Builder generates a configured report (PDF/HTML/gallery) respecting View Mode + filters; Comparison View loads two sessions with delta column, overlaid curves, diff heatmaps, significance indicator.
- Dormant overlays now live: Daily P&L Heatmap near-breach borders; Monte Carlo rule lines + Pass Probability.
- Compare mode works from the top bar; mentor share link encodes source + session + component + filters + `readonly` and restores the exact view (backend stubbed + flagged if needed); Live freshness indicator reflects sync state.
- **Nothing from Phases 1-2 changed or regressed.** All ten categories now active with correct gating (PROP CHALLENGE prop-aware, LIVE DISCIPLINE Live-only, STRATEGY SOURCE Strategy-only).
- Full a11y: keyboard nav, focus indicators, screen-reader announcements, navigation landmark.
- RTL verified across all categories. View-Mode correct everywhere. Zero console errors. Performance budget met. No design-system violations.

## 6. Definition of done (whole dashboard)

The dashboard is complete when:

- All components across all ten categories render without errors on sample sessions for every supported source.
- Single categorized navigation, **no Basic/Advanced split** anywhere.
- **Four modes behave per spec:** Standard (can opt into the prop-challenge toolkit), Prop (challenge configurator with 1-step/2-step + futures/forex, variation optimizer, pass simulation), Live (private or prop; discipline filter + Demon Catcher + plan-adherence equity), Strategy (merged with a working reconciliation layer).
- Gating correct: PROP CHALLENGE prop-aware (default in Prop, opt-in in Standard/Strategy, auto-on for Live prop accounts); LIVE DISCIPLINE Live-only; STRATEGY SOURCE Strategy-only.
- Risk-adjusted metrics (Sharpe, Sortino, Calmar, CAGR, Kelly %, SQN, Recovery Factor, Ulcer Index) all live in `metrics.ts` and surface in the Quant KPI Strip / Consistency / Rolling — no ad-hoc recomputation.
- Talaria Score deterministic; Tag Matrix intersects pre × post tags; TP/SL replay checks SL before TP; Monte Carlo + Pass Probability under 5s; Variation Optimizer + Daily Limit Optimization worker-backed with grid caps.
- Demon Catcher renders the arena UI (sized cards, boss spotlight, fade-on-death, 8-in-a-row streak warning, Survival→…→Profitability rail) — not a spreadsheet.
- Strategy reconciliation maps tags/instruments, handles date-range + scale + currency, lists conflicts, and degrades cross-source views gracefully until resolved.
- All filters + View-Mode recompute correctly within budget; simulations off the main thread.
- Sub-windows, Compare mode, Report Builder, mentor share links all functional.
- RTL, accessibility, performance budgets all met. Zero console errors. No design-system violations.

*End of Phase 3 — and of the build. The dashboard now matches the full reference PDF, with live data, one unified navigation, and four modes (Standard / Prop / Live / Strategy).*
