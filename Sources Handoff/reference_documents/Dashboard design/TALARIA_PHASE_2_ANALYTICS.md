# Talaria Dashboard — Phase 2 (Analytical Depth)

> **For: Codex.** This is the second of three build phases. Phase 1 delivered the shell, primitives, data layer, and the ESSENTIALS + EXCURSION categories. **Phase 2 adds the four analytical categories** that turn the dashboard from a reporting tool into an analysis engine: **WHAT-IF SIMULATOR, STATISTICAL, PATTERNS & BEHAVIOR, STRATEGY HEALTH**.
>
> Do not rebuild or restyle anything from Phase 1. Reuse the existing shell, primitives, data contracts, design tokens, View-Mode formatter, filters, and `<SubWindow>`. This phase only fills in previously-greyed navigation categories. The companion reference PDF shows the intended look of each component.

---

## Phase 2 scope

| Build in Phase 2 | Already built (Phase 1) | Deferred (Phase 3) |
|---|---|---|
| **WHAT-IF SIMULATOR** (5) | Shell, routing, state | PROP FIRM views |
| **STATISTICAL** (6) | Primitives + SubWindow | EXPORT (Report Builder, Comparison) |
| **PATTERNS & BEHAVIOR** (10, incl. Variables Analysis) | Data layer + metrics | Full Prop Firm source wiring |
| **STRATEGY HEALTH** (3) | ESSENTIALS + EXCURSION | |

Un-grey these four categories in the side-nav as you build them. Leave PROP FIRM and EXPORT greyed (Phase 3).

---

## 1. New shared infrastructure for Phase 2

Phase 2 introduces compute-heavy features. Build this infrastructure first:

### 1.1 Web Worker compute harness

Several Phase-2 features must run off the main thread. Create a reusable worker harness (`/workers/`) that accepts a job type + payload and returns results without blocking the UI. Jobs needed in Phase 2:

- `monteCarlo` — simulate N equity paths from trade outcomes.
- `coinFlip` — simulate a random-entry strategy with the same win rate / avg win-loss for the vs-Random comparison.
- `tpslReplay` — replay `barHighR[]`/`barLowR[]` against candidate TP/SL levels (SL checked before TP) for the optimizer and heatmap.
- `edgeFinder` — scan trade subgroups for statistically significant patterns.
- `behavioralScan` — detect behavioral tags + tilt timeline.
- `sequenceReorder` — shuffle trade order 1000× for the max-DD distribution.
- `variableCombos` — rank N-way tag combinations (cap at triples, min sample) for Variables Analysis.

Show a lightweight progress/"computing…" state on any component awaiting a worker. Cancel in-flight jobs when filters change.

### 1.2 Additional computed metrics (`/utils/`)

Build these pure functions (memoized):

- **expectancyByTpSl(trades, tp, sl)** — replay-based expectancy for a TP/SL combo.
- **rollingMetric(trades, window, kind)** — rolling Sharpe / win% / expectancy / profit factor.
- **autocorrelation(returns, maxLag)** + 95% CI band.
- **runsTest(outcomes)** — Z-score, p-value, longest runs.
- **correlationMatrix(tradesBySymbol)** — pairwise return correlations.
- **tagCross(trades)** — for every (preTag × postTag), expectancy + count + win rate + confidence.
- **tagPerformance(trades, which)** — per-tag stats for pre or post tags.
- **edgeFinderInsights(trades, minSample=20, significance=0.95)** — ranked plain-language patterns.
- **behavioralTags(trades)** + **tiltSeries(trades)**.
- **regimeStats(trades)** — win rate + expectancy per (trend × volatility) and per session.
- **variableCombos(trades, level, minTrades)** — rank combinations (single/pairs/triples) of any tagged variable by P&L/expectancy.
- **variableRanking(trades)** — flat per-variable stats (trades, win%, avg R, P&L, profit factor, max DD, expectancy).
- **sqn(trades)** — already in the Phase-1 `metrics.ts` library; Rolling Metrics and the Quant KPI Strip consume it. (Phase 2 adds no new core metrics — Sharpe/Sortino/Calmar/Kelly/CAGR/SQN/Ulcer all live in `metrics.ts` from Phase 1. Phase-2 statistical views pull from it.)
- **edgeDecay(trades)** — smoothed expectancy over time + half-life estimate.
- **optimalF(trades)** — growth rate vs position size curve; actual / optimal / half-Kelly markers.
- **sequenceRisk(trades)** — reorder DD distribution, path-dependency, bad-streak probabilities.

All read the same `Trade`/`Session` contracts from Phase 1. Fields `preTradeTags`, `postTradeTags`, `entryQuality`, `exitQuality`, `rulesFollowed`, `rulesViolated`, `marketRegime` were already collected in Phase 1 — Phase 2 is where they get used. If any are still stubbed, degrade gracefully and flag `// TODO: engine must populate`.

---

## 2. Phase 2 components

> Each: chart type · data read · interactions. Sources = all unless noted. Slugs for routing. Reuse `<ChartFrame>` and `<SubWindow>`. Match the reference PDF.

### 2.1 WHAT-IF SIMULATOR

**Expectancy Heatmap** `expectancy-heatmap` — 2D grid, x = SL 0.5-1.5R (11 steps), y = TP 1.0-5.0R (17 steps). Cell = simulated expectancy `(simWinRate*tp)+(simLossRate*-sl)` cost-adjusted, color red→yellow→green, gold star on the max cell. Replay via `tpslReplay` worker (SL before TP). Per-setup + per-pair filters. Click a cell → load that TP/SL into the optimizer + sim-vs-actual.

**Simulated vs Actual Equity** `sim-vs-actual` — dual line: solid cyan (actual `session.equityCurve`) + dashed gold (simulated from chosen TP/SL). Gap shaded green if sim>actual else red. Recompute when sliders/heatmap selection change.

**TP/SL Optimizer (Excursion Bars)** `tpsl-optimizer` — vertical bars per trade: above 0 green (0→MFE) then faded orange (→total MFE); below 0 red (0→MAE); exit-marker dash. Draggable **gold TP line** + **red SL line**. On drag, `tpslReplay` recomputes; live stats panel: Win Rate, Avg Winner R, Avg Loser R, Expectancy, Profit Factor, $ impact. Flipped trades flash. Sort: chronological / MFE desc / MAE asc / actual RR.

**Planned vs Actual Discipline** `planned-actual` — stats panel two columns. Left: TP Mod Rate, SL Mod Rate, Avg Planned RR, Avg Actual RR (net, winners), Discipline Gap, Avg Risk per Trade. Optional planned-vs-actual scatter (dots vs y=x). Data: `slTpModifications[]`, plannedRr, actualRrNet, plannedRiskPct.

**Advanced Management Stats** `advanced-mgmt` — stats panel: Multi-Entry %, All-Entries-Filled %, Multi-TP %, BE Triggered %, Stopped-at-BE %, Trail Activated %. Data: numEntries, numTps, be*, trail*, partialExits[].

### 2.2 STATISTICAL

**R-Multiple Distribution** `r-multiple-dist` — histogram of `actualRrNet` with normal overlay (gold); vertical lines for mean, median, expected-R-from-win-rate; faint cumulative-R overlay. Click a bar → drill to trades in that bucket. Show skew + kurtosis.

**Rolling Metrics** `rolling-metrics` — line over a rolling window (30/60/90) with green/gold/red threshold zones. Tabs: Rolling Sharpe / Win% / Expectancy / Profit Factor. Uses `rollingMetric`. Also surface **SQN (System Quality Number)** here and as a Quant KPI option (from last year's Equity page).

**Monte Carlo & Pass Probability** `monte-carlo` — simulation workspace. Controls: sims (100/500/1000/5000), horizon, method (Bootstrap/Parametric/Reorder), view (Paths/Density/Percentile-fan/Cone). Main: 1,000 semi-transparent paths + P5/P25/P50/P75/P95 envelope. Outcome distributions: end-equity + drawdown histograms with median/P95. **vs Random tab** = Coin Flip Distribution (actual vs random-entry same win rate; show Statistical Edge Confidence + p-value). Scenario Builder: sliders for risk%, win rate, avg R → re-run via `monteCarlo` worker live. (Prop-challenge rule overlays + Pass Probability gauge are wired here but only populated once a challenge is configured — default-on in Prop mode, opt-in elsewhere — in Phase 3; build the tab now, show a "configure a prop challenge to simulate" placeholder otherwise.)

**Autocorrelation of Returns** `autocorrelation` — bars at lags 1-20 with 95% CI band; bars outside band highlighted red. Uses `autocorrelation`.

**Symbol Correlation Matrix** `correlation-matrix` — square grid (typ. 6×6), diagonal 1.0, green positive / red negative, value printed. Uses `correlationMatrix`.

**Win/Loss Runs Test** `runs-test` — last ~80 trades as up/down colored bars around a midline; stats Z-score, p-value, longest win/loss runs. Uses `runsTest`.

### 2.3 PATTERNS & BEHAVIOR

**Tag Cross-Analysis Matrix** `tag-matrix` — **the flagship.** Heatmap, rows = pre-trade tags, cols = post-trade tags. Cell color = expectancy of trades with both tags; cell size = count; <5-trade cells semi-transparent (low confidence); value printed. Click a cell → sub-window with the specific trades. Uses `tagCross`. Build this carefully — it is the primary differentiator.

**Tag Performance Tables** `tag-tables` — two sortable tables side by side: Pre-Trade and Post-Trade tag performance. Columns: tag, trades, win rate (+ rolling sparkline), avg R, total P&L, expectancy, per-tag Sharpe, STRENGTH/WEAKNESS badge. Default sort total P&L desc. Uses `tagPerformance`.

**Variables Analysis** `variables-analysis` — the N-way generalization of the Tag Matrix. Ranks arbitrary combinations of ANY tagged variable (session, structure, bias, entry model, emotion, custom) by P&L. Combination Level selector (Single/Pairs/Triples), min-trades filter, top/bottom combinations as chained chips + bars, win-rate-vs-P&L bubble scatter. Worker-backed (`variableCombos`). Adopted from last year's strongest idea; pairs with the Tag Matrix as the deep explorer.

**Variables Ranking Table** `variables-table` — flat sortable companion: one row per single variable value, columns Trades / Win% / Avg R / P&L / Profit Factor / Max DD / Expectancy, negative-P&L flagged red. Uses `variableRanking`.

**Trade Flow (Setup → Tag)** `trade-flow` — Sankey. Left nodes = setups (FVG/OB/MSS…), middle = Win/Loss, right = post-trade tags (Target/Early Exit/Stopped/Managed…). Ribbon width ∝ trade count along each path; ribbons colored by source node. Shows where good setups leak into bad outcomes. Data: per-trade setupTag → outcome → dominant postTradeTag.

**Edge Finder** `edge-finder` — ranked list of auto-detected patterns; each card: icon + plain-language headline + evidence + P&L impact + "Show me the trades" + "Apply as filter". Settings panel: min sample (default 20), significance (default 95%), pattern types. Uses `edgeFinderInsights` (worker).

**Behavioral Tilt Timeline** `tilt-timeline` — line/area of composite tilt indicator (size deviation + frequency spikes + post-loss behavior) over time, spikes highlighted. Below: Behavioral Tags grid (green strengths / red leaks: Revenge Trader, Morning Specialist, Friday Fade, Holds Losers, Disciplined, News Avoider/Hunter), After-Win vs After-Loss comparison, session-boundary behavior. Uses `behavioralTags` + `tiltSeries` (worker).

**Execution & Rule Adherence** `execution-rule-adherence` — Planned vs Actual R:R scatter (dots vs y=x, slippage stat) + Entry Quality distribution + Exit Quality distribution + Stop Hunt Detection (% losers stopped by <5 pips before reversing) + **Rule Adherence card** (big ring = % followed all rules; three-column With-rules vs Without-rules vs Difference for win rate / avg R / expectancy; rule-violation breakdown bars by rule name). Data: plannedRr, actualRrNet, entryQuality, exitQuality, barHigh/LowR, rulesFollowed, rulesViolated[] (ties to Strategy Builder).

**Price Behavior Explorer** `price-behavior` — lines over candles since entry (-20 to +50), y = % move from entry: avg winner (green), avg loser (red), median (blue), faint individuals (toggle). Vertical refs at avg MFE peak / avg exit / avg MAE trough. Filters: symbol, session, tag, side, outcome. Data: per-trade path arrays.

**Market Regime Matrix** `regime-matrix` — 3×3 grid (Up/Down/Range × Low/Normal/High vol), cell = win rate × color-by-expectancy, R value printed. Plus per-session cards (Asian/London/NY-AM/NY-PM) and Regime Filter Comparison equity curve (best regime only vs all). Uses `regimeStats`.

### 2.4 STRATEGY HEALTH

**Edge Decay** `edge-decay` — smoothed expectancy line over time, area fill, gold break-even reference, vertical markers at regime/rule changes. Below: Win Rate / Profit Factor / Sharpe stability sub-cards + Edge Half-Life estimate. Uses `edgeDecay`.

**Position Sizing (Optimal F)** `position-sizing` — Optimal F curve (growth rate vs position size 0.5-5%), markers for actual / optimal / half-Kelly. Plus Drawdown Trade-off ("Half-Kelly = 80% of growth at 40% of drawdown"), Size Variance Over Time, Size-Performance Correlation scatter. Uses `optimalF`.

**Sequence Risk** `sequence-risk` — Random Reorder Distribution (shuffle 1000×, plot max-DD distribution; vertical line at actual max DD = luck factor). Path Dependency Simulation (worst 10 trades first). Bad Streak Probability table (P(3/5/7/10 losses)). Uses `sequenceRisk` (worker).

---

## 3. Phase 2 build order

1. Web Worker harness + the six job types (Section 1.1).
2. New computed metrics in `/utils/` (Section 1.2), memoized, tested against known cases.
3. STATISTICAL category (depends on workers + metrics; Monte Carlo is the anchor).
4. WHAT-IF SIMULATOR (depends on `tpslReplay`).
5. PATTERNS & BEHAVIOR (Tag Matrix first — it's the differentiator; then Variables Analysis + Ranking Table, tables, flow, edge finder, tilt, execution, price behavior, regime). Note: the Phase-1 Trade Duration page should be upgraded to the three-linked-bucket-chart layout (P&L / count / win rate) from last year's build if not already.
6. STRATEGY HEALTH.
7. Un-grey the four categories in the nav as each completes.
8. Phase-2 polish: RTL, View-Mode correctness, worker cancellation on filter change, sub-window export, zero console errors.

## 4. Phase 2 acceptance criteria

- All four categories un-greyed; all 24 Phase-2 components render without errors on sample data across Standard/Live/Strategy sources.
- **Nothing from Phase 1 changed or regressed.**
- Web Worker jobs (Monte Carlo, Coin Flip, TP/SL replay, Edge Finder, Behavioral, Sequence reorder) run off the main thread; UI stays responsive; jobs cancel on filter change.
- Monte Carlo + Coin Flip complete under 5s; the vs-Random comparison shows a confidence score + p-value.
- TP/SL Optimizer and Expectancy Heatmap correctly replay `barHighR[]`/`barLowR[]` with SL checked before TP; flipped trades flash.
- Tag Cross-Analysis Matrix correctly intersects pre × post tags with confidence shading and click-to-drill.
- Variables Analysis ranks N-way combinations (single/pairs/triples) with a min-trades filter, worker-backed; Variables Ranking Table sorts every single variable correctly.
- SQN computed and displayed correctly.
- Edge Finder surfaces plausible plain-language patterns; Behavioral detection flags ≥2 patterns on a session designed to trigger them.
- Rule Adherence correctly compares with-rules vs without-rules using `rulesFollowed`/`rulesViolated`.
- Filters + View-Mode recompute correctly across every Phase-2 component within the 200ms budget (excluding worker jobs, which show progress).
- RTL verified (layout mirrors, charts/digits do not). Tokens only, sharp corners, semantic color, typography scale.
- Monte Carlo's Prop-Firm tab shows a clean "Prop Firm source required" placeholder when source ≠ Prop Firm (full wiring in Phase 3).

*End of Phase 2. Leave PROP FIRM and EXPORT greyed for Phase 3.*
