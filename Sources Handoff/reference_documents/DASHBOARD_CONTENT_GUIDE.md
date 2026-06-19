# Talaria Dashboard Content Guide

This file explains what the Dashboard contains, what each visual answers, and what data is required to render it correctly.

Implementation reference: `src/TalariaV8b.jsx`

## Dashboard Purpose

The Dashboard is the decision layer for a trading source. A source can be:

- One backtest session
- One live journal account
- Multiple selected sources
- One strategy with selected child sources
- A comparison between the active source and another source

The Dashboard should help the trader answer four questions quickly:

1. Is this source profitable?
2. Is the performance stable enough to trust?
3. Is the risk acceptable?
4. Is the trader following the rules that created the edge?

## Global Controls

| Control | Purpose | Questions Answered | Data Needed |
|---|---|---|---|
| Source button | Selects the active dataset shown on the dashboard. | What am I analyzing right now? Is this a session, journal, strategy, or multiple sources? | Source id, source type, display name, linked sessions, linked journals, child source ids, trade count. |
| Compare button | Enables comparison mode against another source. | Is source A better than source B? Which source has better P&L, win rate, drawdown, and trade count? | Main source metrics, compare source metrics, shared date range where possible. |
| Filters button | Opens date, timing, trade scope, and tag filters. | What happens if I isolate this period, market, direction, tag, or outcome? | Trade dates, day/time, duration, market, symbol, direction, outcome, pre-trade tags, post-trade tags. |
| Value mode button | Switches money display between dollars, percentage, and privacy. | Can I show the dashboard without revealing account size? What is the same result as a percent? | Starting balance, current equity, P&L, return %. |
| Add Trade button | Starts the flow for adding/editing a trade in the selected source. | Which source do I want to edit? Will editing change source status? | Selected source list, source edit status, journal/backtest status flags. |
| Pages button | Opens dashboard page navigation. | Which analysis page should I inspect next? | Current page id and page metadata. |

## Core Data Model

Minimum backend/front-end data should normalize into these shapes.

```js
Source = {
  key: "session:12",
  kind: "session" | "journalAccount" | "journalEntry" | "strategy" | "strategyJournal",
  label: "NQ Momentum - Q1 2024",
  typeLabel: "Backtest" | "Journal" | "Strategy" | "Multiple",
  sessions: Session[],
  trades: Trade[],
  childSourceKeys?: string[],
  status?: SourceStatus
}
```

```js
Session = {
  id: string | number,
  name: string,
  strategyName: string,
  tradingMode: "standard" | "prop",
  assetClasses: string[],
  tickers: string[],
  timeframe: string,
  startDate: "YYYY-MM-DD",
  endDate: "YYYY-MM-DD",
  capital: number,
  pnl: number,
  trades: number,
  progress: number,
  rollbackAllowed: boolean,
  costsEnabled?: boolean,
  editedTrades?: boolean
}
```

```js
Trade = {
  id: string | number,
  sourceSessionId: string | number,
  n: number,
  date: "YYYY-MM-DD",
  symbol: string,
  market: string,
  side: "Long" | "Short",
  pnl: number,
  rMultiple: number,
  duration: number,
  tag: string,
  preTags: Record<string, string | boolean>,
  postTags: Record<string, string | boolean>,
  outcome: "Win" | "Loss" | "Breakeven",
  rulesFollowed: boolean,
  rulesViolated: string[],
  plannedRR: number,
  actualRR: number,
  entryQuality: number,
  exitQuality: number,
  mae: number,
  mfe: number,
  positionSize: number,
  marketRegime: {
    trend: string,
    volatility: string
  },
  nearbyNewsEvent: string | null
}
```

## Dashboard Pages

| Page | Purpose | Main Question |
|---|---|---|
| Overview | Fast decision summary with Talaria Score, KPIs, equity, risk, rule adherence, and key charts. | Is this source worth trusting or investigating further? |
| Performance | Account growth, drawdown, returns, and consistency. | Is performance growing smoothly or through unstable swings? |
| The Numbers | Aggregate trade statistics, distributions, timing, and breakdowns. | What does the trade sample look like numerically? |
| Trade Quality | Entry, exit, MAE, MFE, planned vs actual execution. | Are trades being managed well? |
| What-If Lab | Simulated improvements and alternative rules. | Which change would improve results the most? |
| Edge & Behavior | Tags, behavior, rule breaks, edge decay, and sabotage points. | Where does the edge come from and what damages it? |
| Journal | Individual trade review. | Which exact trades explain the result? |
| Prop Challenge | Funded-account pass/fail and rules pressure. | Can this pass a prop-firm evaluation? |
| Live Discipline | Live journal behavior and plan adherence. | Is the trader following the plan in live execution? |
| Strategy & Sources | Source reconciliation, attribution, and compare/export tools. | How do backtest, prop, live, and strategy sources combine? |

## Overview Page Visuals

| Visual | What It Does | Questions It Answers | Data Needed |
|---|---|---|---|
| Talaria Score card | Combines profitability, consistency, risk, frequency, discipline, and edge into one score/tier. | Is this source healthy overall? Is the score improving or decaying? Which dimension is weak? | Net P&L, return %, profit factor, drawdown, trade count, rule adherence, expectancy, prior-period metrics. |
| Talaria Score donut/radar/trend | Alternative views of the score: overall gauge, six-dimension radar, or score trajectory. | Is the strength balanced or one-dimensional? Is the score stable over time? | Score dimensions, prior score, goal/elite target values, time-series score values. |
| Edge Finder strip | Shows quick edge strengths and weaknesses. | What is the first actionable insight? What looks unusually strong or weak? | Grouped metrics by symbol, tag, time, session, rule status, expectancy, win rate, P&L. |
| Net P&L KPI | Total filtered profit/loss after costs. | Did this source make money? How much? | Trade P&L, costs/commission, selected value mode. |
| Return % KPI | Net P&L as a percentage of starting capital. | Is the result meaningful relative to account size? | Starting balance, net P&L. |
| Trade Win Rate KPI | Percentage of trades that closed profitable. | How often does this strategy win? | Trade count, winning trade count, losing trade count. |
| Day Win Rate KPI | Percentage of trading days that ended green. | Is performance steady by day or concentrated? | Daily grouped P&L from trade dates. |
| Profit Factor KPI | Gross wins divided by gross losses. | Is the strategy structurally profitable? | Gross profit, gross loss. |
| Avg R KPI | Average R-multiple per trade. | Does the edge survive position-size normalization? | Trade R-multiples. |
| Max Drawdown KPI | Worst equity decline from a prior peak. | How painful was the worst decline? | Equity curve, starting balance. |
| Trades / Duration KPI | Count and average duration of filtered trades. | Is there enough sample size? How long are trades held? | Trade count, duration per trade. |
| Prop status banner | Shows prop-firm target, drawdown, daily loss, and minimum day pressure. | Is the prop challenge passing, failing, or at risk? | Prop rules, capital, daily P&L, drawdown, profit target, trading days. |
| Rule Adherence panel | Compares trades that followed rules vs trades that broke rules. | Are rule breaks costing performance? | rulesFollowed, rulesViolated, P&L, R, win/loss. |
| Compare summary banner | Shows high-level deltas between active and compare source. | Is the selected compare source better or worse? | Main and compare metrics: P&L, drawdown, win rate, trades. |
| In-progress backtest panel | Shows completion state and controls for an unfinished test. | How much of the test is complete? | Session progress %, start/end dates, status. |
| No-Go flags | Highlights critical or cautionary warnings. | What should stop the trader from scaling this source? | Drawdown thresholds, sample size, rule breaks, negative expectancy, prop rule violations. |

## Basic Dashboard Charts

| Chart | What It Does | Questions It Answers | Data Needed |
|---|---|---|---|
| Equity Curve | Plots account equity through the selected trades. | Is the account rising smoothly? Where are drawdowns? | Ordered trades, cumulative P&L, starting balance, dates. |
| Win / Loss donut | Shows win-rate share as a ring. | Is win rate high enough for the strategy style? | Winning trades, losing trades, total trades. |
| Drawdown curve | Plots drawdown below the equity peak. | How deep and long are losing phases? | Equity curve, running peak, drawdown values. |
| R-Multiple Distribution | Histogram of trade outcomes by R bucket. | Are results built on many small edges or a few outliers? | rMultiple per trade. |
| Daily P&L Heatmap | Calendar-like daily performance blocks. | Which days were good/bad? Are losses clustered? | Trade date, daily P&L, trade count per day. |
| Performance Breakdown | Bar rows by chosen grouping such as symbol, session, tag, or outcome. | Which category contributes most profit or loss? | Trade grouping fields, P&L, trades, win rate. |
| Cross-Analysis | Conditional grouped analysis when the user activates cross-analysis. | What happens if I group wins/losses by hour, weekday, symbol, session, or tag? | Active cross filter, group key, trade P&L/outcome. |
| Performance Calendar | Day/time performance grid. | Which day/time combinations are strongest or weakest? | Trade date, day of week, hour, P&L. |
| Consistency | Shows stability across time and trades. | Is the strategy consistent or dependent on a few periods? | Daily rows, equity curve, rolling metrics. |
| Behavioral Tags | Shows performance by behavior/tag. | Which behaviors help or hurt the strategy? | Pre-trade tags, post-trade tags, tag values, P&L, outcome. |
| Goal Tracker | Shows progress toward target. | Is the source on track to hit goal or challenge target? | Current return, target return, capital, time elapsed. |
| Trade Journal | Table of recent/filtered trades. | Which exact trades should I review? | Trade id, date, symbol, side, R, P&L, exit status, tag. |
| Streaks & Records | Shows win/loss sequence and record stats. | Are losses clustering? What are best/worst records? | Ordered trades, win/loss outcome, P&L, duration. |

## Advanced Dashboard Charts

| Chart | What It Does | Questions It Answers | Data Needed |
|---|---|---|---|
| Quant KPI Strip | Compact strip of risk-adjusted statistics. | Is the strategy good after risk adjustment? | Daily P&L, gross win/loss, drawdown, R, Monte Carlo outputs. |
| Monte Carlo Projection | Simulates many future equity paths. | What is the pass/fail or ruin risk if trade order changes? | Trade returns or R values, capital, prop targets, simulation count. |
| Price Behavior Explorer | Compares average price paths around entries. | Do winners and losers behave differently after entry? | Pre/post-entry price series per trade, entry timestamp, outcome. |
| MAE / MFE Scatter | Plots maximum adverse/favorable excursion per trade. | Are stops/targets placed efficiently? Are winners allowed to run? | MAE, MFE, P&L, R per trade. |
| Execution Analysis | Compares planned R:R vs actual R:R and quality scores. | Is the trader executing the plan or degrading it? | plannedRR, actualRR, entryQuality, exitQuality, P&L. |
| Advanced Distributions | Shows drawdown frequency and risk metrics. | How often does drawdown occur and what is the risk profile? | Drawdown points, gross win/loss, expectancy, Avg R. |
| 3D Heatmap | Matrix-style source/category intensity visualization. | Which symbol/session combinations stand out? | Symbol, session/time bucket, performance score or P&L. |
| Correlation Matrix | Shows relationship between symbols/sources. | Are losses correlated across instruments? | Symbol-level return series or grouped trade returns. |
| Runs Test | Displays trade sequence randomness and clustering. | Are wins/losses randomly distributed or clustered? | Ordered trade outcomes, wins, losses, streak lengths. |
| Trade Microscope | Breaks trades by duration, volatility, and market regime. | Which market conditions produce good trades? | Duration, volatility regime, trend regime, P&L, win rate. |
| Edge Decay | Rolling expectancy line. | Is the edge improving, flat, or fading? | Ordered trades, rolling R/expectancy window. |
| Sequence Risk | Stress-tests bad ordering and loss runs. | What if the worst losses happen first? | Trade P&L/R, loss count, longest loss run. |
| Macro Event Correlation | Shows trades near news/events. | Are news events helping or hurting results? | nearbyNewsEvent, event category/time, trade P&L. |
| Rule Compliance Tracker | Prop/rule table with pass/fail state. | Which rule is closest to failing? | Prop rules, daily loss, total drawdown, min days, target, current values. |

## Page-Specific Sections

### Performance

| Section | Purpose | Data Needed |
|---|---|---|
| Equity & Returns | Reads growth, return %, ending equity, and smoothness. | Equity curve, starting balance, ending balance, dates. |
| Drawdown | Reads max drawdown, drawdown %, recovery, and pain zones. | Running peak, equity values, trade order. |
| Streaks, Consistency, Risk-Adjusted Metrics | Reads clustering and risk-adjusted quality. | Daily P&L, trade outcomes, Sharpe/Sortino/Calmar inputs. |

### The Numbers

| Section | Purpose | Data Needed |
|---|---|---|
| Win/Loss Distribution | Reads wins, losses, payoff ratio, and outcome shape. | Trade outcome, P&L, R. |
| Calendar & Time | Finds good/bad days, hours, and sessions. | Trade datetime, session label, P&L. |
| Breakdowns | Groups performance by symbol, market, tag, setup, or source. | Group fields, P&L, R, trades, win rate. |

### Trade Quality

| Section | Purpose | Data Needed |
|---|---|---|
| MAE/MFE | Checks whether stops and targets fit real movement. | MAE, MFE, entry, stop, target, exit. |
| Planned vs Actual | Measures execution drift. | plannedRR, actualRR, entryQuality, exitQuality. |
| Management Quality | Finds early exits, late exits, stop mistakes, partials. | Exit reason, post-trade tags, R, P&L. |

### What-If Lab

| Section | Purpose | Data Needed |
|---|---|---|
| What-If Simulator | Simulates removing bad tags, changing stops/targets, or optimizing rules. | Trade-level P&L/R, tags, rule status, stop/target outcomes. |
| Alternative Strategies | Compares modified rule sets. | Original trades plus simulated inclusion/exclusion rules. |

### Edge & Behavior

| Section | Purpose | Data Needed |
|---|---|---|
| Patterns & Behavior | Finds behavioral patterns that add or remove edge. | Tags, rule adherence, reason, outcome, P&L. |
| Strategy Health | Reads whether the edge is broad, stable, and scalable. | Score dimensions, expectancy, sample size, drawdown, filters. |

### Journal

| Section | Purpose | Data Needed |
|---|---|---|
| Filtered Summary | Summary of visible trades. | Filtered trade list, P&L, win/loss, Avg R. |
| Trade Journal | Row-level review. | Trade id, date, symbol, direction, R, P&L, tags, notes, screenshots if available. |

### Prop Challenge

| Section | Purpose | Data Needed |
|---|---|---|
| Prop Rules | Tracks target, daily loss, max drawdown, min days, and pass/fail status. | Prop preset, starting balance, daily P&L, equity curve, trading days. |
| Pass Probability | Estimates chance of passing if the current distribution continues. | Trade return distribution, target, drawdown rules, Monte Carlo settings. |

### Live Discipline

| Section | Purpose | Data Needed |
|---|---|---|
| Live Plan Adherence | Checks live trades against strategy rules. | Live journal trades, rulesFollowed, rule breaks, strategy tag mapping. |
| Edited Journal Status | Shows whether live data has been manually modified. | Journal edit flags, trade edit timestamps, connection/account id. |

### Strategy & Sources

| Section | Purpose | Data Needed |
|---|---|---|
| Source Reconciliation | Detects differences in tags, symbols, account scale, currency, and date basis. | Source metadata, tag maps, symbol maps, account/currency info. |
| Source Attribution | Shows each source contribution to total result. | Source list, source P&L, source trades. |
| Backtest vs Live | Compares simulated/backtested behavior against live journal behavior. | Backtest source, live source, shared strategy id, P&L series. |
| Comparison View | Compares main and selected comparison source. | Main source metrics, compare source metrics. |
| Report Builder | Chooses which sections are included in exports. | Selected page ids, report section flags. |

## Metric Definitions

| Metric | Formula | Used By |
|---|---|---|
| Net P&L | `sum(trade.pnl)` after costs | KPI cards, equity curve, source attribution. |
| Return % | `netPnl / startingBalance * 100` | Return KPI, goal tracker, prop challenge. |
| Gross Win | `sum(pnl where pnl > 0)` | Profit factor, stacked bars. |
| Gross Loss | `abs(sum(pnl where pnl < 0))` | Profit factor, drawdown/risk views. |
| Profit Factor | `grossWin / grossLoss` | KPI strip, Talaria Score, advanced distributions. |
| Win Rate | `winningTrades / totalTrades * 100` | Win/loss donut, trade quality, prop estimates. |
| Avg R | `average(trade.rMultiple)` | Avg R KPI, R distribution, edge decay. |
| Expectancy R | Average expected R per trade, usually same as average R when normalized. | Edge, quant strip, advanced distributions. |
| Max Drawdown | Maximum peak-to-trough equity drop. | Drawdown chart, prop rules, Talaria Score. |
| Calmar | `return% / maxDrawdown%` | Quant KPI strip, drawdown views. |
| Sharpe | Average daily return divided by daily volatility. | Quant KPI strip, risk-adjusted views. |
| Sortino | Downside-risk version of Sharpe. | Quant KPI strip. |
| Recovery Factor | `abs(netPnl) / maxDrawdown` | Quant KPI strip. |
| Rule Adherence % | `rulesFollowedTrades / totalTrades * 100` | Rule adherence, discipline score. |

## Filter Data Requirements

| Filter Section | Data Needed | Notes |
|---|---|---|
| Date Range | Trade date, source start/end date. | Dates outside source range must be unavailable. |
| Timing | Day of week, time of day, duration. | Supports multiple days, multiple time ranges, and duration ranges. |
| Trade Scope | Market, symbol, direction, outcome. | Checkbox sections require at least one selected value when enabled. |
| Tags | Pre-trade tag groups and post-trade tag groups with values. | Pre tags use gold accent; post tags use purple accent. |
| Source Filter | Child sources under selected strategy or multiple-source selection. | Only appears when selected source can be broken into child sources. |

## Source Status Icons

| Source Type | Status Inputs | Meaning |
|---|---|---|
| Backtest | Rollback on/off, real-world costs on/off, trade database edited/original. | Shows whether the backtest data is clean, cost-realistic, and protected by rollback. |
| Live Journal | Edited/unedited. | Shows whether live journal data has been changed after import/sync. |
| Strategy | Aggregated child-source statuses. | One icon summarizes rollback, costs, trade database state, and live journal edit state. |

## Backend Integration Notes

The backend does not need to pre-compute every visual, but it must provide stable raw fields. The frontend can derive most metrics if it receives:

- All trades for selected source(s)
- Session metadata and capital
- Source hierarchy: strategy -> sessions/journals
- Tag definitions and tag values per trade
- Rule adherence fields
- Prop firm rule preset fields when `tradingMode === "prop"`
- Edit/status flags for backtests and journals
- Price excursion fields or price series if MAE/MFE and price behavior charts should be accurate

Recommended API endpoints:

```txt
GET /dashboard/sources
GET /dashboard/sources/:sourceKey/trades
GET /dashboard/strategies/:strategyId/sources
GET /dashboard/journals/:journalId/trades
POST /dashboard/metrics/compare
POST /dashboard/trades
PATCH /dashboard/trades/:tradeId
```

## Empty and Edge States

| State | Expected Behavior |
|---|---|
| No trades | Show empty chart shells with "No trades in current selection"; disable metrics that require trades. |
| One trade | Show basic P&L and journal row; avoid misleading Sharpe, Sortino, Monte Carlo, correlation, and runs test. |
| Privacy mode | Hide dollar values only; keep percentages, counts, ratios, score, and chart structure visible. |
| Filters remove all trades | Show `0 / total - 0%`; charts should not crash. |
| Multiple sources | Aggregate totals but keep source attribution available. |
| Strategy source | Allow child-source filtering without losing the parent strategy context. |
| Prop source | Always show rule status and pass/fail pressure. |

## Suggested QA Questions

1. Does every chart update when source changes?
2. Does every chart update when filters change?
3. Does privacy mode hide every money value?
4. Does comparison mode use the correct main source and compare source?
5. Does strategy source mode keep parent strategy selected while child-source filters change?
6. Do prop rules appear only for prop-mode sources?
7. Do charts handle 0 trades, 1 trade, and 1000+ trades without errors?
8. Are Arabic/RTL labels readable and unclipped?

