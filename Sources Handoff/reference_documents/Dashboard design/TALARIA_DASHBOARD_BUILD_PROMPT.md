# Talaria Analytics Dashboard — Complete Build Specification

> **For: Codex.** This document is the single source of truth for rebuilding the Talaria analytics dashboard. It specifies every component, its data contract, its visual spec, and how the navigation, sources, and filters tie together. Build to this document. Where this document is silent on a detail, follow the existing Talaria design system (Exo 2, dark theme, the color tokens below) and keep it consistent.

---

## 0. How to read this document

- **Section 1** — global architecture: the four data sources, the single categorized navigation, the shared shell (top bar, filters, view modes), the data contracts.
- **Section 2** — the design system tokens you must use everywhere.
- **Section 3** — shared primitives (reusable chart/UI components) to build once and reuse.
- **Section 4** — every component, grouped by navigation category, with: what it is, the exact chart type, the data it reads, the interactions, and the source support.
- **Section 5** — build order, performance budget, and acceptance criteria.

Each component in Section 4 maps 1:1 to a page in the reference PDF. Build all of them.

---

## 1. Architecture

### 1.1 Four data sources

Every view in the dashboard reads trades from **one active source** at a time. The source is chosen in the top bar. The four sources:

| Source | Meaning | Distinguishing data |
|---|---|---|
| **Standard** | Free-form backtest. "Did the strategy make money?" | Plain trade objects, no rule constraints |
| **Prop Firm** | Backtest under prop firm rules. "Would this pass an evaluation?" | Adds `propFirmRules` + daily aggregation + pass/fail status |
| **Live** | Real trades from a connected broker (MT4/MT5/Tradovate/Project X), imported near-real-time | Same trade shape, flagged `source: 'live'`, may stream updates |
| **Strategy** | A merged dataset combining any subset of Standard + Prop Firm + Live trades grouped under one strategy name | Trades carry an `originSource` field so the merge can be decomposed |

#### What each mode does (read carefully — this drives several categories)

**Standard backtest.** Free-form backtest of a strategy. Primary question: did it make money and is the edge real? **It can ALSO run the full prop-challenge toolkit on demand** — the user sets challenge rules ad hoc in the dashboard (see the PROP CHALLENGE category) and asks "could this strategy pass?", "which parameter variations would pass?", and "what's the simulated pass rate?". So the prop tooling is NOT locked to Prop mode; in Standard it is an opt-in overlay the user invokes.

**Prop mode.** The strategy is evaluated continuously against a configured prop challenge. The user uses this mode to judge their ability to pass a funded-account evaluation. The challenge is configurable along three axes: **1-step vs 2-step** (and the rules differ per phase), **futures vs forex** (different limit conventions, e.g. trailing vs static drawdown, intraday vs EOD), and the specific firm/account size. Prop mode must support: (a) performance vs every rule, (b) a challenge **configurator**, (c) a **variation optimizer** that shows which strategy variations AND which challenge settings reach the goal, and (d) **Monte-Carlo simulation** of pass probability.

**Live journal.** Real trades from a connected broker — for a **private account OR a prop account** (the user flags which; if prop, the prop tooling applies to live data too). Live mode adds two things on top of the standard analytics: (1) the **Demon Catcher** discipline tool (Section 4.x), and (2) a mandatory per-trade **discipline filter** — every live trade is tagged *According to plan / Out of plan / Missed trade*. These tags let the dashboard plot **actual performance vs the strategy's intended performance** and produce a **Discipline Score**.

**Strategy source.** A merged dataset combining any subset of Standard + Prop Firm + Live trades grouped under one strategy name; each trade carries `originSource`. It can also run the prop-challenge toolkit. **Because it merges heterogeneous sources, it requires a reconciliation layer** (Section 1.6) to handle different tag vocabularies, date ranges, instruments, and account scales before any cross-source view is valid.

**Source support per component is declared in Section 4.** Components fall into three gating classes:
- **All sources** — most analytics.
- **Prop-aware** (PROP CHALLENGE category: Challenge Configurator, Pass Probability, Variation Optimizer, Rule Compliance & Utilization, Daily Limit Optimization): **available in Standard, Prop, Live-as-prop, and Strategy**, but only *shown by default* in Prop mode. In Standard/Strategy they appear once the user opts in by configuring a challenge; in Live they appear when the account is flagged as a prop account.
- **Live-only** (Demon Catcher, Discipline Filter & Score, Plan-Adherence Equity): shown only when source = Live.
The Strategy source renders all layouts and additionally exposes source-attribution breakdowns where noted.

### 1.2 Single categorized navigation (NO Basic/Advanced split)

There is **no** Basic/Advanced toggle. All components live in one categorized drop-list (a left side-nav on desktop, a dropdown on narrow widths). The categories and their components:

```
ESSENTIALS
  Talaria Score
  Sub-Score Breakdown
  Strategy Radar
  KPI Strip
  Quant KPI Strip
  Equity Curve
  Cumulative R Curve
  Drawdown
  Win / Loss Distribution
  Balance Waterfall
  Performance Calendar
  Daily P&L Heatmap
  Performance by Instrument / Session / Day
  Instrument Bubble
  Streaks & Records
  Consistency
  Trade Journal
  Best & Worst Trades
  Performance Highlights

EXCURSION (MAE / MFE)
  Session Stat Cards (7)
  Excursion Stat Cards (7)
  What-If Bars
  Capture Ratio Histogram
  Post-Exit MFE Curve
  Post-Exit MFE by Setup
  MAE Distribution
  MFE Distribution
  During vs Total MFE Scatter
  MAE vs MFE Scatter
  Trade Path Cloud
  Box Plots at Key Moments
  Setup Comparison
  Losers Recovery Rate
  Per-Instrument Breakdown Table
  Trade Duration Analysis

WHAT-IF SIMULATOR
  Expectancy Heatmap
  Simulated vs Actual Equity
  TP/SL Optimizer (Excursion Bars)
  Planned vs Actual Discipline
  Advanced Management Stats

STATISTICAL
  R-Multiple Distribution
  Rolling Metrics
  Monte Carlo & Pass Probability
  Autocorrelation of Returns
  Symbol Correlation Matrix
  Win/Loss Runs Test

PATTERNS & BEHAVIOR
  Tag Cross-Analysis Matrix
  Variables Analysis
  Variables Ranking Table
  Tag Performance Tables
  Trade Flow (Setup → Tag)
  Edge Finder
  Behavioral Tilt Timeline
  Execution & Rule Adherence
  Price Behavior Explorer
  Market Regime Matrix

STRATEGY HEALTH
  Edge Decay
  Position Sizing (Optimal F)
  Sequence Risk

PROP CHALLENGE  (prop-aware: shown by default in Prop mode; opt-in elsewhere)
  Challenge Configurator
  Rule Compliance & Utilization
  Pass Probability & Simulation
  Variation Optimizer
  Daily Limit Optimization

LIVE DISCIPLINE  (only when active source = Live)
  Discipline Filter & Score
  Demon Catcher
  Plan-Adherence Equity (Actual vs Strategy)

STRATEGY SOURCE  (only when active source = Strategy)
  Source Reconciliation
  Source Attribution Breakdown

EXPORT
  Report Builder
  Comparison View
```

**Navigation behavior:**
- Side-nav groups are collapsible. Active item gets a 3px left accent border + dim-blue background + the label in `acL`.
- The active component name appears as a breadcrumb in the top bar: `Talaria › Tag Cross-Analysis Matrix`.
- Persist the last-viewed component per user in `localStorage`. Default to `Talaria Score` (the first ESSENTIALS item) on first open.
- Implement hash routing: `#/dashboard/<category>/<component-slug>` so views are bookmarkable and shareable.

### 1.3 Shared shell

A single shell wraps every component:

- **Top bar (persistent):** logo, source selector (Standard / Prop Firm / Live / Strategy), session/dataset selector, **a persistent Current Balance pill** (respects Privacy mode → `***`), a **Live freshness indicator** ("Updated 12s ago" / "Live" for the Live source), filter pills, View-Mode dropdown, Compare button, Export button, breadcrumb.
- **Filter pills (affect every component):** Symbol, Result (All/Win/Loss), Setup tag, Date range, Session, Gross/Net toggle. Changing any filter re-computes every visible component. Target: re-render within **200ms for 5,000 trades**.
- **View-Mode dropdown (affects all monetary displays):** Dollars (default) / Percentage / R-Multiple / Pips / Ticks / Privacy. Privacy mode replaces all currency values with `***` but keeps charts and percentages visible.
- **Left side-nav:** the categorized list from 1.2.
- **Content area:** the active component, rendered full-width.

All state (source, filters, view mode, selected session) persists across navigation without a reload. Navigation is a content-area swap, not a page reload.

### 1.4 Data contracts

Build to these shapes. If the backtest/journal engine doesn't yet emit a field, stub it with a sensible default and mark it `// TODO: engine must populate`.

```typescript
type Source = 'standard' | 'propFirm' | 'live' | 'strategy';

interface Trade {
  id: string;
  source: Source;
  originSource?: Source;          // for Strategy-merged datasets
  symbol: string;                 // "EURUSD"
  side: 'long' | 'short';
  openTime: string;               // ISO 8601
  closeTime: string;              // ISO 8601
  entryPrice: number;
  exitPrice: number;
  size: number;                   // lots / contracts
  pnlDollarsNet: number;
  pnlDollarsGross: number;
  commissionTotal: number;
  swap: number;
  currency: string;

  // R-multiple analytics
  plannedRr: number;              // R:R at entry
  actualRrGross: number;
  actualRrNet: number;
  plannedRiskPct: number;

  // excursion (the advanced metrics) — all in R-multiples from first entry
  maeR: number;                   // max adverse excursion
  mfeR: number;                   // max favorable excursion during trade
  totalMfeR: number;              // max favorable incl. post-exit window
  captureRatio: number;           // actualRrNet / totalMfeR * 100
  wouldHaveWon: boolean;          // post_mfe_from_entry_r >= plannedRr * 0.5

  // the three arrays (entry → 50 bars post-exit, all in R)
  barCloseR: number[];
  barHighR: number[];
  barLowR: number[];
  postCheckpoints?: { bar: number; r: number }[];

  // tags
  setupTag: string;               // "FVG" | "OB" | "Breaker" | "MSS" | "IFVG"
  preTradeTags: string[];         // ["HTF Bias Aligned","Liquidity Swept",...]
  postTradeTags: string[];        // ["Target Reached","Exited Early","Moved SL",...]

  // execution quality
  entryQuality: number;           // 0-100, how close to optimal entry
  exitQuality: number;            // 0-100

  // rule adherence (ties to Strategy Builder conditions)
  rulesFollowed: boolean;
  rulesViolated: string[];
  optionalConfirmations: string[];

  // management
  numEntries: number;
  numTps: number;
  beEnabled: boolean;
  beTriggered: boolean;
  trailEnabled: boolean;
  trailActivated: boolean;
  slTpModifications: { field: 'sl' | 'tp'; from: number; to: number; time: string }[];
  partialExits: { fraction: number; price: number; time: string }[];

  // regime + context (tagged at entry)
  marketRegime: {
    trend: 'up' | 'down' | 'range';
    volatility: 'low' | 'normal' | 'high';
    session: 'asian' | 'london' | 'ny-am' | 'ny-pm' | 'overlap';
  };
  nearbyNewsEvent?: string | null;

  // --- LIVE-mode discipline (required for Live source) ---
  planAdherence?: 'according-to-plan' | 'out-of-plan' | 'missed-trade';
  // 'missed-trade' rows represent a planned setup the trader did NOT take;
  // they have no realized P&L but carry the hypothetical R the plan would have produced.
  hypotheticalRr?: number;        // for missed-trade rows: what the plan would have made
  demons?: string[];              // Demon Catcher errors committed on this trade
                                  // e.g. ['entered-too-late','moved-sl-to-be','bet-too-large']

  notes?: string;
  screenshotUrl?: string;
}

interface Session {
  id: string;
  name: string;                   // "NQ Momentum — Q1 2024"
  source: Source;
  startingBalance: number;
  currentBalance: number;
  leverage: number;
  currency: string;
  equityCurve: number[];          // balance after each trade
  maxDrawdownDollars: number;
  maxDrawdownPct: number;
  instruments: Record<string, { trades: number; settings?: object }>;
  trades: Trade[];

  // computed + cached
  talariaScore: number;           // 0-100
  talariaScoreHistory: { date: string; score: number }[];
  subScores: { profitability: number; risk: number; consistency: number; discipline: number };

  // --- live account type (Live source) ---
  accountType?: 'private' | 'prop';   // if 'prop', prop tooling applies to live data

  // --- prop challenge configuration (used by Prop mode AND by Standard/Strategy opt-in) ---
  propChallenge?: {
    assetClass: 'futures' | 'forex';
    structure: '1-step' | '2-step' | 'instant';
    firmPreset?: string;              // 'FTMO' | 'MyForexFunds' | 'The5ers' | 'FundedNext' | 'Topstep' | 'Apex' | 'custom'
    accountSize: number;
    // per-phase rules — array length matches structure (1 or 2)
    phases: {
      profitTargetPct: number;
      dailyLossLimitPct: number;
      // futures often use trailing/EOD drawdown; forex often static — capture both:
      maxDrawdownPct: number;
      drawdownType: 'static' | 'trailing' | 'eod-trailing';
      minTradingDays: number;
      maxTradingDays?: number | null;  // null = unlimited
    }[];
    consistencyRulePct?: number | null; // e.g. no single day > 40% of total profit (some firms)
    weekendHoldingAllowed: boolean;
    newsTradingAllowed: boolean;
  };
  propFirmStatus?: {
    currentPhase: number;             // 1 or 2
    result: 'pass' | 'fail' | 'inProgress';
    failedRule?: string;
    failedDate?: string;
    failedPhase?: number;
    daysToHitTarget?: number;
  };

  // --- Live discipline rollups (Live source) ---
  disciplineScore?: number;           // 0-100, from planAdherence distribution
  demonLog?: Record<string, number>;  // demon id -> times committed this session

  // --- Strategy source reconciliation (only when source = 'strategy') ---
  mergedSources?: {
    members: { sessionId: string; source: Source; trades: number; dateRange: [string, string] }[];
    tagMap: Record<string, string>;          // raw tag -> canonical tag (user-defined mapping)
    instrumentMap: Record<string, string>;   // raw symbol -> canonical symbol
    dateRangeMode: 'union' | 'intersection' | 'custom';
    effectiveDateRange: [string, string];
    normalization: 'none' | 'r-multiple' | 'percent-of-account'; // how to compare across account scales
    conflicts: { type: 'tag' | 'instrument' | 'date' | 'currency' | 'scale'; detail: string; resolved: boolean }[];
  };

  userGoals?: { monthlyProfitTarget: number; weeklyTradesTarget: number; winRateTarget: number; maxDrawdownLimit: number };
  userAnnotations?: { tradeIndex: number; text: string }[];
}
```

### 1.5 Core metrics library (`/utils/metrics.ts`)

Build these as pure, memoized functions. They are referenced throughout Section 4. **Every component that shows a risk-adjusted or return metric must pull from this library — do not recompute ad hoc.** All respect the active Gross/Net toggle and View Mode.

| Metric | Formula / definition | Where it surfaces |
|---|---|---|
| **Net / Gross P&L** | Σ pnl (net or gross) | KPI Strip, Session Stats |
| **Win rate** | wins / total | everywhere |
| **Profit factor** | gross profit / gross loss | KPI Strip, Session Stats |
| **Expectancy (R)** | mean(actualRrNet) | KPI Strip, R-Multiple |
| **Avg win / avg loss** | mean win $, mean loss $ | Win/Loss |
| **Max drawdown** ($ and %) | peak-to-trough of equity | Drawdown |
| **CAGR** | (endBal/startBal)^(365/days) − 1 | KPI Strip (sublabel), Consistency |
| **Sharpe ratio** | mean(periodReturn) / stdev(periodReturn) × √(periodsPerYear) | Consistency, Rolling, Quant KPI |
| **Sortino ratio** | mean(periodReturn) / downsideDeviation × √(periodsPerYear) | Consistency, Quant KPI |
| **Calmar ratio** | CAGR / maxDrawdownPct | Consistency, Quant KPI |
| **Recovery factor** | net profit / maxDrawdown$ | Quant KPI, Streaks |
| **Kelly %** | W − (1−W)/R, where W=win rate, R=avg win/avg loss | Position Sizing, Quant KPI |
| **SQN (System Quality Number)** | √N × mean(R) / stdev(R) | Statistical, Quant KPI |
| **Std dev of returns / volatility** | stdev(periodReturn) | Consistency |
| **Ulcer Index** | RMS of drawdown depths | Drawdown (sublabel), Quant KPI |
| **R-multiple stats** | mean, median, stdev, skew, kurtosis of actualRrNet | R-Multiple Distribution |

Notes: periodReturns default to per-trade unless the component specifies a calendar period (daily/weekly). `periodsPerYear` is inferred from trade frequency for Sharpe/Sortino annualization. Downside deviation uses returns below a 0% threshold (configurable to MAR). Expose a single **Quant KPI Strip** component (in ESSENTIALS) that renders Sharpe, Sortino, Calmar, CAGR, Kelly %, SQN, Recovery Factor, Ulcer Index as a row of mini-cards, each with a sparkline — so the risk-adjusted metrics have an explicit home, not just scattered sublabels.

### 1.6 Strategy-source reconciliation layer (`/utils/reconcile.ts`)

The Strategy source merges heterogeneous sessions. Before ANY merged view renders, run reconciliation and surface conflicts. This is a required build item, not optional.

**Reconciliation steps:**
1. **Tag mapping.** Different sources use different tag vocabularies ("FVG" vs "Fair Value Gap"; "London" vs "LDN"). Present a **tag-mapping UI**: list every raw tag across members, let the user map each to a canonical tag (`tagMap`). Unmapped tags are flagged and excluded from cross-source tag analytics until mapped.
2. **Instrument normalization.** Map raw symbols to canonical symbols (`instrumentMap`) — "EURUSD" / "EUR/USD" / "EUR_USD" → one. Futures vs forex of the "same" market stay distinct unless the user explicitly maps them.
3. **Date-range handling.** Members cover different date ranges. Offer `dateRangeMode`: **union** (all trades, timeline may have gaps per source), **intersection** (only the overlapping window — the only valid mode for fair cross-source comparison), or **custom**. Show the effective range and a per-source coverage bar.
4. **Account-scale normalization.** A $10k backtest and a $100k live account can't be summed in dollars. `normalization`: **r-multiple** (default for merged — compare in R), **percent-of-account**, or **none** (only valid when scales already match). Dollar-denominated views are disabled or relabeled when scales differ.
5. **Currency.** If members use different account currencies, flag it; require a normalization choice (convert to one currency at a stated rate, or switch to % / R).
6. **Conflict panel.** Every unresolved conflict (unmapped tag, mismatched scale, disjoint dates, currency mismatch) appears in a **Source Reconciliation** view with a clear "resolve" action. Cross-source components show a non-blocking banner ("3 tags unmapped — some tag analytics hidden") until resolved, and **degrade gracefully** rather than showing wrong numbers.

The **Source Attribution Breakdown** view then decomposes any aggregate ("of +$8,340 net, Standard contributed X, Live contributed Y") and supports a **backtest-vs-live divergence** comparison when the same strategy appears in multiple sources.

---

## 2. Design system (use these tokens everywhere)

```
Font:           Exo 2 (all weights). Tabular-nums on every number.
Backgrounds:    bg #07080E   ·  dark #0A0C14  ·  well #060710  ·  surface #0E1220
Borders:        br #1A2030   ·  brHover #2A3447
Text:           tx #E8EEF8 (primary)  ·  ts #8C99B0 (secondary)  ·  tm #5A6478 (muted)
Accents:        blue #2643F7  ·  blueLight #4A6AFF (active/links)
Semantic:       green #00D4A1 (profit/win)  ·  red #FF5068 (loss)  ·  gold #C9A84C (warning/secondary brand)
Extra series:   cyan #36C5D4  ·  orange #FF8C42  ·  purple #9B6DFF
```

Rules:
- Sharp corners (border-radius 0) on cards, inputs, buttons.
- No drop shadows on cards. Hover = border brightens to `brHover`, no lift, no scale.
- Gradient-fade dividers between sections (a 1px line fading `blue → blueLight → blue` or a subtle gold variant).
- Color is **semantic only** — green=good, red=bad, gold=caution, blue=active. Never decorative.
- Typography scale (use only these): 8px micro-label / 10px body / 14px component title / 16px sub-number / 24px hero number. Section labels: 8px weight 800 uppercase, letter-spacing 0.06em.
- Charts render in SVG with a proper `viewBox`. Numbers right-aligned, labels start-aligned. RTL: mirror layout but **never** mirror charts (time axis stays left-to-right); keep digits LTR.

---

## 3. Shared primitives (build once, reuse everywhere)

Build these in `/components/primitives/` before building components:

- `<GaugeRing score color label sublabel />` — partial-arc ring with center number. Used by Talaria Score, sub-scores, capture ratio, pass probability, recovery factor.
- `<Sparkline values color />` — tiny inline line chart.
- `<DotTrail outcomes />` — row of green/red dots (last N outcomes).
- `<StackedRatioBar segments />` — horizontal bar split into colored segments.
- `<ProgressBar value target zones />` — fill bar with target marker + threshold zones.
- `<BoxPlotMini stats />` — compact box plot.
- `<HeatmapCell value confidence />` — single colored cell, semi-transparent when low sample.
- `<KpiCard label value color visual />` — number + one embedded visual (sparkline/dots/bar/box).
- `<SubWindow title onClose onPin>` — draggable, resizable modal (default 720×560, min 480×400, max 90vw). Header with title + pin + close. Footer with Export (PNG/CSV/JSON) + Copy + Close. Escape/click-outside to close. Single sub-window at a time. 150ms fade+scale. Many components open a sub-window for depth — wire a `subWindowId` prop and a `SubWindowRouter`.
- `<ChartFrame title actions>` — the standard card chrome: 32px header (icon + title + ⋯ menu), 16px-padded body, optional footer. Every chart sits in one.

Every numeric formatter must respect the active **View Mode** (Dollars/%/R/Pips/Ticks/Privacy).

---

## 4. Components

> Each entry: **chart type**, **data read**, **interactions**, **sources**. Build all. Slugs are for routing.

### 4.1 ESSENTIALS

**Talaria Score** · slug `talaria-score` · sources: all
- Chart: large `<GaugeRing>` 0-100 with color zones (0-40 red "Needs Work", 41-70 gold "Developing", 71-100 green "Strong"). Center shows the number + label.
- Data: `session.talariaScore`. Formula (compute in `/utils/talariaScore.ts`, cache on session): `0.30*profitability + 0.30*risk + 0.20*consistency + 0.20*discipline`, each sub-score normalized 0-100. Profitability from profit factor (cap 3.0→100) + net return%. Risk = `100 - maxDDpct*5` floored at 0. Consistency = `%profitableWeeks*0.6 + (100 - normStdDev)*0.4`. Discipline = `% of trades with rulesFollowed === true`.
- Tier sublabel derived from the score (Developing / Proficient / Strong / Elite) for a motivational hook — replaces last year's separate star-rating, which would have competed with the score.
- Interaction: double-click → sub-window explaining what pulls the score up/down + 30-day trend.

**Sub-Score Breakdown** · slug `sub-scores` · sources: all
- Chart: four mini `<GaugeRing>` in a row — Profitability, Risk, Consistency, Discipline — each with its 0-100 value + label.
- Data: `session.subScores`.
- Interaction: hover each ring → tooltip listing the metrics that feed it.

**Strategy Radar** · slug `strategy-radar` · sources: all
- Chart: 6-axis radar (Profitability, Consistency, Risk Control, Frequency, Discipline, Edge), 0 at center → 100 at outer ring, filled blue polygon, rings at 33/66/100%.
- Data: the four sub-scores + Frequency (trade count vs period length, normalized) + Edge (expectancy normalized).
- Interaction: optional overlay of a second session's polygon (ghosted) when in Compare mode.

**KPI Strip** · slug `kpi-strip` · sources: all
- Chart: grid of 8 `<KpiCard>` (4×2): Net P&L (sparkline), Return % (progress bar to goal), Trade Win Rate (dot trail), Day Win Rate (dot trail), Profit Factor (stacked ratio bar), Avg R (box-plot mini), Max Drawdown (underwater sparkline), Trades/Avg Duration (duration histogram).
- Data: aggregations over filtered trades. Day Win Rate = % of trading days that closed net green.
- Interaction: double-click any card → sub-window with 1-year history + filters.

**Quant KPI Strip** · slug `quant-kpi` · sources: all
- Chart: a row of mini-cards for the risk-adjusted / return metrics, each with a sparkline: **Sharpe · Sortino · Calmar · CAGR · Kelly % · SQN · Recovery Factor · Ulcer Index**. All pulled from the metrics library (Section 1.5) — never recomputed ad hoc. Color-coded by healthy/marginal/poor bands per metric.
- Data: `metrics.ts` over filtered trades; periods inferred for annualization.
- Why: gives the professional risk-adjusted metrics an explicit, scannable home rather than scattering them as sublabels. This is where Sharpe/Sortino/Calmar/Kelly/CAGR live.

**Equity Curve** · slug `equity-curve` · sources: all
- Chart: line of balance after each trade; green on rising segments, red on falling; red shaded area between running-peak line and equity (drawdown); trade-marker dots colored by symbol; optional news-event markers above.
- Data: `session.equityCurve[]`, per-trade pnl + symbol + timestamps; optional benchmark series.
- Interaction: tabs Equity / Cumulative P&L / Returns % / Rolling 30-trade P&L / vs Buy & Hold / vs Random Entry. **Granularity selector (Daily / Weekly / Monthly / Quarterly / Yearly)** plus chart-type (Area/Line) and accumulation (Cumulative/Per-period) toggles (adopted from last year's Portfolio Growth controls). Brush selector at bottom to zoom a date range (local to this chart). Click on the curve to drop a persistent annotation. Hover dot → trade tooltip.

**Cumulative R Curve** · slug `cumulative-r` · sources: all
- Chart: running sum of `actualRrNet` per trade as a line, area fill under, zero baseline if it crosses, endpoint marker with `+X.XR` label.
- Data: per-trade `actualRrNet`.
- Why: sizing-independent edge picture.

**Drawdown** · slug `drawdown` · sources: all
- Chart: underwater curve (0 at top, red fill dipping down). Headline stats: max DD %, avg recovery time (trades), worst recovery.
- Data: per-trade pnl → running peak/equity; timestamps for recovery duration.
- Interaction: sub-window listing every drawdown (date, depth, duration, recovery trades, trigger).

**Win / Loss Distribution** · slug `win-loss` · sources: all
- Chart: donut sized by outcome counts (green wins / red losses / grey breakevens), center win-rate %, legend with counts; plus a stacked ratio bar of avg-win vs avg-loss size.
- Data: per-trade outcome + avg win/loss dollars.

**Balance Waterfall** · slug `waterfall` · sources: all
- Chart: waterfall — Start (blue) → Wins (green up) → Losses (red down) → Commission (red) → Swap (red) → End (blue), connector lines tracing the running total, value labels on Start and End.
- Data: aggregated gross profit, gross loss, total commission, total swap, start + end balance.
- Why: makes fees visible. Critical for prop firm margins.

**Performance Calendar** · slug `performance-calendar` · sources: all
- Chart: hour-of-day (rows) × day-of-week (cols) heatmap. Cell color = P&L intensity (green/red). Cell size optionally scaled by trade count.
- Data: per-trade openTime (hour + weekday), pnl. Aggregate per (hour, weekday).
- Interaction: sub-window to recolor by Wins-only / Losses-only / Avg R / Win rate / cross-analyzed by symbol or tag. Click a cell → filter the dashboard to that slice.

**Daily P&L Heatmap** · slug `daily-pnl` · sources: all
- Chart: 6-week × 7-day calendar grid; cell background = daily P&L intensity; small trade-count number inside; **a weekly-total column on the right sums each row** (adopted from last year's calendar); for Prop Firm, red border if a rule was near-breached (>50% utilization), solid red fill if breached.
- Data: per-day aggregated pnl + trade count; prop firm daily utilization.
- Interaction: hover a cell → popover with the day's full breakdown.

**Performance by Instrument / Session / Day** · slug `breakdowns` · sources: all
- Chart: three horizontal-bar panels (by symbol, by session, by weekday). Each row = P&L bar + trade-count sub-bar + win-rate badge.
- Data: per-group aggregations (pnl, count, win rate).
- Interaction: click a row → filter the dashboard to that group.

**Instrument Bubble** · slug `instrument-bubble` · sources: all
- Chart: scatter — x = win rate, y = expectancy (R), bubble size = trade count, color green/red by expectancy sign, dashed expectancy-zero line.
- Data: per-symbol win rate, expectancy, trade count.
- Why: one-glance instrument selection (keep/cut).

**Streaks & Records** · slug `streaks` · sources: all
- Chart: dot-trail visuals — longest win streak (green dots), longest loss streak (red dots), current streak (live dot trail), best/worst day (mini equity curves), drawdown recovery records.
- Data: outcome sequence, per-day equity, recovery durations.

**Consistency** · slug `consistency` · sources: all (home of Sharpe / Sortino / Calmar / CAGR / volatility detail)
- Chart: Sharpe (labeled "Consistency Score") + % profitable weeks (horizontal bar) + weekly-returns std-dev (thin violin) + return-to-drawdown ratio across 7/30/180/365-day windows (small line chart).
- Data: weekly returns, Sharpe, R/D ratios.

**Trade Journal** · slug `trade-journal` · sources: all
- Chart: table, last 10-20 trades. Columns: #, date, symbol, side, R, P&L, exit reason, tag. Each row includes a **mini equity-curve sparkline** (from `barCloseR[]`) showing MAE/MFE inline, and a **rule-adherence dot** (green=all rules, gold=optional missed, red=invalidator triggered).
- Data: full trade objects + `barCloseR[]`.
- Interaction: hover a row → highlight that trade on the main equity curve. Click → trade detail sub-window with notes + screenshot. Show **inline indicators per row**: a note icon when `notes` exists and a thumbnail-count badge when `screenshotUrl` exists (adopted from last year's build). Edge Finder insight chips strip at the bottom.

**Best & Worst Trades** · slug `best-worst` · sources: all
- Chart: two ranked lists side by side — Top 5 winners (green) and Top 5 losers (red). Each row: symbol, R-multiple, $ result, dominant tag.
- Data: per-trade sorted by `actualRrNet`.
- Why: outliers drive results; losers' shared tags reveal the leak.

**Performance Highlights** · slug `performance-highlights` · sources: all
- Chart: a slim always-visible insight strip of 3-4 chips — Best Setup, Most Profitable Instrument, Best Time of Day, Best Day of Week — each with win rate + trade count + P&L. Also surfaced on the landing/Performance Summary view.
- Data: best subgroup by P&L across setup / instrument / hour / weekday (min sample 20). **Shares the `edgeFinderInsights` detection** so it never disagrees with the Edge Finder page.
- Interaction: click a chip → jump to the Edge Finder page for the full pattern.
- Why (adopted from last year's build): gives immediate coach-like value on the landing view without navigating; pulls users toward the deeper Edge Finder.

### 4.2 EXCURSION (MAE / MFE)

> All excursion components read the three per-trade arrays `barCloseR[]`, `barHighR[]`, `barLowR[]` (entry → 50 bars post-exit, in R), plus the scalar excursion fields. Respect the Gross/Net toggle on all RR/PnL values. The "Session Warning include/exclude" filter excludes trades with a post-exit session-boundary crossover from post-exit analytics.

**Session Stat Cards (7)** · slug `session-stats` · sources: all
- Chart: 7 stat cards in one view (this is a deliberate grouped page): BALANCE (green if > start else red), NET PnL (signed), WIN RATE (gold), PROFIT FACTOR (green if >1 else red), EXPECTANCY (mean actualRrNet, green if +), MAX DD (always red), COMMISSION (orange). Each = small label + large colored value + accent left edge.
- Data: `session.currentBalance`, computed net pnl, win rate, profit factor, expectancy, `maxDrawdownDollars`, sum commission.

**Excursion Stat Cards (7)** · slug `excursion-stats` · sources: all
- Chart: 7 stat cards: AVG MAE (red), AVG MFE (green), CAPTURE (gold, 0-100), WIN MAE 90th (gold, 90th pct of maeR for winners), MGMT GAP (red, mean mfeR for wins − mean actualRrGross for wins), EXIT GAP (orange, mean totalMfeR − mean mfeR for wins), RECOVERY (cyan, % losers where wouldHaveWon).
- Data: per-trade maeR, mfeR, totalMfeR, captureRatio, wouldHaveWon.

**What-If Bars** · slug `whatif-bars` · sources: all
- Chart: 3 vertical bars — "What You Got" (gold, avg actualRr for winners), "Available During" (cyan, avg mfeR), "Available Total" (orange, avg totalMfeR). Red arrow between bars 1-2 labeled management gap; orange arrow between bars 2-3 labeled exit-timing gap.
- Data: winners' actualRr, mfeR, totalMfeR. Gross/Net affects bar 1.

**Capture Ratio Histogram** · slug `capture-hist` · sources: all
- Chart: 5-bucket vertical histogram (0-20/20-40/40-60/60-80/80-100%), colored worst→best (red/orange/gold/green/teal), count label on each bar.
- Data: per-winner `captureRatio = actualRrNet/totalMfeR*100`.

**Post-Exit MFE Curve** · slug `post-exit-mfe` · sources: all
- Chart: 2-line chart over bars 0-50 after exit — winners (green) and losers (red) average additional MFE in R from exit; semi-transparent fills; dashed gold plateau line where curve slope drops below 25% of average.
- Data: per-trade post-exit max favorable R from exit price.

**Post-Exit MFE by Setup** · slug `post-exit-by-setup` · sources: all
- Chart: multi-line, one per setup (FVG green, OB cyan, Breaker orange, MSS purple, IFVG gold), winners only, bars 0-50.
- Data: per-setup winners' post-exit MFE per bar checkpoint.
- Insight: steepest curve = hold longer on that setup.

**MAE Distribution** · slug `mae-dist` · sources: all
- Chart: stacked bar histogram, buckets 0-.2/.2-.4/.4-.6/.6-.8/.8-1/1-1.2/>1.2 R; green winners (bottom) + red losers (top).
- Data: per-trade `maeR`. Insight: bucket where green stops = optimal SL boundary.

**MFE Distribution** · slug `mfe-dist` · sources: all
- Chart: stacked bar histogram, buckets 0-.5/.5-1/1-1.5/1.5-2/2-2.5/2.5-3/>3 R; same green/red stacking.
- Data: per-trade `mfeR`. Insight: losers with MFE > 1R = trades that were winning before reversing.

**During vs Total MFE Scatter** · slug `during-total-scatter` · sources: all
- Chart: scatter, x = `mfeR`, y = `totalMfeR`; circles = winners, X = losers; dashed gold y=x diagonal (on diagonal = exit captured full move).
- Data: per-trade mfeR, totalMfeR, outcome.

**MAE vs MFE Scatter** · slug `mae-mfe-scatter` · sources: all
- Chart: scatter, x = MAE (negative-right), y = MFE; winners cluster bottom-right, losers top-left; y=−x reference.
- Data: per-trade maeR, mfeR, outcome. Filter tabs: All / Wins / Losses / By pre-trade tag / By post-trade tag.

**Trade Path Cloud** · slug `path-cloud` · sources: all
- Chart: overlay of all trades, x = normalized bars (0-50 during trade resampled, 50-100 post-exit), y = R from entry. Thin green (winners α0.07) / red (losers α0.10) lines, thick median lines for each group, 25-75 percentile bands, dashed gold exit divider at bar 50, faint orange post-exit tint.
- Data: `barCloseR[]` resampled to 50 points + post-exit appended.

**Box Plots at Key Moments** · slug `box-plots` · sources: all
- Chart: two side-by-side box-plot charts (winners | losers), six stages each. Winners: MAE(red) MFE(green) Exit(gold) Post+10/25/50(orange). Losers: MFE(green) MAE(red) Exit(red) Post+10/25/50(cyan). Box = 25-75 pct, whiskers = range, diamond = mean, dashed gold divider between exit and post-exit.
- Data: per-trade maeR/mfeR/exit R + post-exit checkpoint maxima from `barCloseR[]`.

**Setup Comparison** · slug `setup-comparison` · sources: all
- Chart: grouped bar, one cluster per setup (FVG/OB/Breaker/MSS/IFVG), 5 bars each: MAE(red) ActualRR(gold) DuringMFE(cyan) TotalMFE(orange) Capture%-scaled(purple). X labels show setup name + trade count + win rate + capture %.
- Data: per-setup winner means (MAE uses all trades). Capture scaled to fit R axis.

**Losers Recovery Rate** · slug `recovery-rate` · sources: all
- Chart: per-setup bars — back bar (total losers, faded red) + front bar (recovered losers, orange) + % label above.
- Data: per-setup `wouldHaveWon` count / total losers. Insight: high % = stop too tight for that setup.

**Per-Instrument Breakdown Table** · slug `instrument-table` · sources: all
- Chart: table, one row per symbol + totals row. Columns: Pair, Trades, Win Rate, Net PnL, Avg RR, Avg MAE, Avg MFE, Capture %, Commission. Pair colored by its accent.
- Data: per-symbol aggregations.

**Trade Duration Analysis** · slug `trade-duration` · sources: all
- Chart: three linked bar charts sharing one duration-bucket scale (1-2m / 2-5m / 5-10m / 10-30m / 30m-1h / 1-2h / 2-4h / 4h+): (1) P&L by duration, (2) trade count by duration, (3) win rate by duration. Median + average reference lines on each.
- Data: per-trade openTime/closeTime (duration), pnl, outcome.
- Why (refined from last year's most-polished page): isolates the holding-time band where the edge lives and where it leaks; argues for a min/max hold rule.

### 4.3 WHAT-IF SIMULATOR

**Expectancy Heatmap** · slug `expectancy-heatmap` · sources: all
- Chart: 2D grid, x = SL 0.5-1.5R (11 steps), y = TP 1.0-5.0R (17 steps). Cell = simulated expectancy `(simWinRate*tp)+(simLossRate*-sl)` adjusted for costs. Color red→yellow→green. Gold star on max-expectancy cell.
- Data: per-trade `barHighR[]`/`barLowR[]`. Replay each TP/SL combo: check SL first then TP. Per-setup and per-pair filters.

**Simulated vs Actual Equity** · slug `sim-vs-actual` · sources: all
- Chart: dual line — solid cyan (actual) + dashed gold (simulated from new TP/SL). Shaded gap green if sim>actual, red if sim<actual.
- Data: `session.equityCurve[]` + per-trade excursion arrays. Recompute when sliders/heatmap selection change.

**TP/SL Optimizer (Excursion Bars)** · slug `tpsl-optimizer` · sources: all
- Chart: vertical bars, one per trade. Above 0: green (0→MFE) extending faded orange (→total MFE). Below 0: red (0→MAE). Exit marker dash on each bar. Draggable **gold horizontal TP line** (default planned TP) and **red horizontal SL line** (default -1R).
- Data: `barHighR[]`/`barLowR[]`. On drag, replay each trade: did barHigh reach TP before barLow hit SL? Live stats panel updates Win Rate, Avg Winner R, Avg Loser R, Expectancy, Profit Factor, $ impact. Flipped trades flash. Sortable: chronological / MFE desc / MAE asc / actual RR.

**Planned vs Actual Discipline** · slug `planned-actual` · sources: all
- Chart: stats panel (two columns). Left: TP Modification Rate, SL Modification Rate, Avg Planned RR, Avg Actual RR (net, winners), Discipline Gap, Avg Risk per Trade. Optionally a planned-vs-actual scatter.
- Data: `slTpModifications[]`, plannedRr, actualRrNet, plannedRiskPct.

**Advanced Management Stats** · slug `advanced-mgmt` · sources: all
- Chart: stats panel. Multi-Entry Trades %, All Entries Filled %, Multi-TP Trades %, BE Triggered %, Stopped at BE %, Trail Activated %.
- Data: `numEntries`, `numTps`, `beEnabled/beTriggered`, `trailEnabled/trailActivated`, `partialExits[]`.

### 4.4 STATISTICAL

**R-Multiple Distribution** · slug `r-multiple-dist` · sources: all
- Chart: histogram of `actualRrNet` buckets with normal-curve overlay (gold); vertical lines for mean, median, "expected R from win rate"; faint cumulative-R curve overlay. Click a bar → drill to trades in that bucket.
- Data: per-trade actualRrNet + skew/kurtosis.

**Rolling Metrics** · slug `rolling-metrics` · sources: all
- Chart: line over a rolling window (30/60/90 trades) with green/gold/red threshold zones. Tabs: Rolling Sharpe / Win% / Expectancy / Profit Factor.
- Also expose **SQN (System Quality Number)** = √N × mean(R) / stdev(R) as a headline stat here and as a Quant KPI option (adopted from last year's Equity page; a respected single-number system-quality metric).
- Data: time series of returns.

**Monte Carlo & Pass Probability** · slug `monte-carlo` · sources: all (prop-challenge sections need a configured challenge; default-on in Prop mode)
- Chart: simulation workspace. Controls (sims 100/500/1000/5000, horizon, method Bootstrap/Parametric/Reorder, view Paths/Density/Percentile-fan/Cone). Main: 1,000 semi-transparent paths + P5/P25/P50/P75/P95 envelope; for Prop Firm overlay rule lines (daily loss, max DD, target). Outcome distributions: end-equity histogram + drawdown histogram with median/P95 + (Prop Firm) red line at DD limit. vs Random tab = Coin Flip Distribution (actual vs random-entry with same win rate; show Statistical Edge Confidence + p-value). Scenario Builder: sliders for risk%, win rate, avg R → re-run in a **Web Worker**, live.
- Data: per-trade outcomes; prop firm rules. Pass Probability = % of N simulated evaluations that pass all rules; show failure-cause breakdown + presets (FTMO / MyForexFunds / The5ers / FundedNext).

**Autocorrelation of Returns** · slug `autocorrelation` · sources: all
- Chart: bars at lags 1-20 with a 95% CI band; bars outside the band highlighted red.
- Data: return time series.

**Symbol Correlation Matrix** · slug `correlation-matrix` · sources: all
- Chart: square grid (6×6 typical), diagonal = 1.0, green positive / red negative, value printed in each cell.
- Data: per-symbol return series over overlapping windows.

**Win/Loss Runs Test** · slug `runs-test` · sources: all
- Chart: sequence of last ~80 trades as up/down colored bars around a midline; stats: Z-score, p-value, longest win/loss runs.
- Data: outcome sequence.

### 4.5 PATTERNS & BEHAVIOR

**Tag Cross-Analysis Matrix** · slug `tag-matrix` · sources: all
- Chart: heatmap, **rows = pre-trade tags**, **cols = post-trade tags**. Cell color = expectancy of trades carrying both tags; cell size = trade count; cells with <5 trades semi-transparent (low confidence). Value printed.
- Data: per-trade `preTradeTags[]` × `postTradeTags[]` intersections.
- Interaction: click a cell → sub-window with the specific trades. This is the flagship differentiator — get it right.

**Variables Analysis** · slug `variables-analysis` · sources: all
- Chart: a generalized, N-way version of the Tag Matrix. Ranks arbitrary **combinations** of any tagged variable (session, structure, bias, entry model, emotion, custom) by P&L. Combination Level selector (Single / Pairs / Triples), minimum-trades filter, top/bottom combinations as chained chips + bars, and a win-rate-vs-P&L bubble scatter (bubble = trade count).
- Data: every tagged attribute per trade. **Worker-backed** — cap at triples, require min sample (combinatorial explosion otherwise).
- Why (adopted from last year's strongest idea): the Tag Matrix is locked to two dimensions; real traders tag far more. This finds the best AND worst combinations across everything. Pairs with the matrix as the deep explorer.

**Variables Ranking Table** · slug `variables-table` · sources: all
- Chart: flat sortable table, one row per single variable value (e.g. "Entry: MSS", "Structure: Discount"). Columns: Trades, Win %, Avg R, P&L, Profit Factor, Max Drawdown, Expectancy. Negative-P&L variables flagged red. Default sort by P&L.
- Data: per-trade tagged attributes + outcome metrics.
- Why: before exploring combinations, shows which single variables carry the edge and which quietly cost money.

**Tag Performance Tables** · slug `tag-tables` · sources: all
- Chart: two sortable tables side by side — Pre-Trade Tag Performance and Post-Trade Tag Performance. Columns: tag, trades, win rate (with rolling sparkline), avg R, total P&L, expectancy, per-tag Sharpe, STRENGTH/WEAKNESS badge.
- Data: per-tag aggregations. Default sort: total P&L desc.

**Trade Flow (Setup → Tag)** · slug `trade-flow` · sources: all
- Chart: Sankey. Left nodes = setups (FVG/OB/MSS…), middle = Win/Loss, right = post-trade tags (Target/Early Exit/Stopped/Managed…). Ribbon width ∝ trade count along each path; ribbons colored by their source node.
- Data: per-trade setupTag → outcome → dominant postTradeTag.
- Why: shows where good setups leak into bad outcomes. No competitor has this.

**Edge Finder** · slug `edge-finder` · sources: all
- Chart: ranked list of auto-detected patterns; each a card with icon + plain-language headline + evidence + P&L impact + "Show me the trades" + "Apply as filter". Settings panel: min sample size (default 20), significance (default 95%), pattern types.
- Data: statistical scan of subgroups (session/symbol/hour/day/tag) for significant deviations from baseline.

**Behavioral Tilt Timeline** · slug `tilt-timeline` · sources: all
- Chart: line/area of a composite tilt indicator (size deviation + frequency spikes + post-loss behavior) over time; spikes highlighted with context. Below: Behavioral Tags grid (green strengths / red leaks: Revenge Trader, Morning Specialist, Friday Fade, Holds Losers, Disciplined, News Avoider/Hunter), After-Win vs After-Loss comparison, session-boundary behavior.
- Data: per-trade size, time-since-prev-trade, post-loss patterns; rule adherence for "Disciplined".

**Execution & Rule Adherence** · slug `execution-rule-adherence` · sources: all
- Chart: Planned vs Actual R:R scatter (dots vs y=x line, slippage stat) + Entry Quality distribution + Exit Quality distribution + Stop Hunt Detection (% of losers stopped by <5 pips before reversing) + **Rule Adherence card** (big ring = % followed all rules; three-column With-rules vs Without-rules vs Difference for win rate / avg R / expectancy; rule-violation breakdown bars by rule name).
- Data: plannedRr, actualRrNet, entryQuality, exitQuality, `barHighR/LowR`, `rulesFollowed`, `rulesViolated[]` (ties to Strategy Builder conditions).

**Price Behavior Explorer** · slug `price-behavior` · sources: all
- Chart: lines over candles since entry (-20 to +50), y = % move from entry: avg winner path (green), avg loser path (red), median path (blue), faint individual paths (toggle). Vertical reference lines at avg MFE peak / avg exit / avg MAE trough. Filters: symbol, session, tag, side, outcome.
- Data: per-trade price path arrays (`barCloseR[]` + pre-entry context if available).

**Market Regime Matrix** · slug `regime-matrix` · sources: all
- Chart: 3×3 grid (Up/Down/Range × Low/Normal/High vol), cell = win rate × color-by-expectancy with R value printed. Plus per-session cards (Asian/London/NY-AM/NY-PM) and a Regime Filter Comparison equity curve (best regime only vs all).
- Data: per-trade `marketRegime` tags (ADX for trend, ATR for vol, session times).

### 4.6 STRATEGY HEALTH

**Edge Decay** · slug `edge-decay` · sources: all
- Chart: smoothed expectancy line over time, area fill, gold break-even reference line, vertical markers at regime shifts / rule changes. Below: Win Rate / Profit Factor / Sharpe stability sub-cards + Edge Half-Life estimate.
- Data: per-trade expectancy time series.

**Position Sizing (Optimal F)** · slug `position-sizing` · sources: all
- Chart: Optimal F curve (expected growth rate vs position size 0.5-5%), markers for actual / optimal / half-Kelly. Plus Drawdown Trade-off ("Half-Kelly = 80% of growth at 40% of drawdown"), Size Variance Over Time, Size-Performance Correlation scatter.
- Data: per-trade size, win rate, avg win/loss → Kelly + Optimal F math.

**Sequence Risk** · slug `sequence-risk` · sources: all
- Chart: Random Reorder Distribution (shuffle trade order 1000×, plot max-DD distribution; vertical line at actual max DD = luck factor). Path Dependency Simulation (worst 10 trades first). Bad Streak Probability table (P(3/5/7/10 losses)).
- Data: per-trade outcomes; reorder simulation (Web Worker).

### 4.7 PROP CHALLENGE (prop-aware — shown by default in Prop mode; opt-in in Standard/Strategy; auto-on for Live prop accounts)

> This category answers "can this strategy pass a funded evaluation?" It is available in **all sources**: in Prop mode it's the headline; in Standard/Strategy it appears once the user configures a challenge; in Live it appears when `accountType === 'prop'`. All rule math reads `session.propChallenge` (configurable 1-step/2-step, futures/forex).

**Challenge Configurator** · slug `challenge-configurator` · sources: all (the gate that turns the category on)
- UI: a setup panel to define the evaluation. Controls: **asset class (Futures / Forex)**, **structure (1-step / 2-step / instant)**, **firm preset** (FTMO / MyForexFunds / The5ers / FundedNext / Topstep / Apex / Custom — selecting a preset fills the rules, which remain editable), **account size**, and **per-phase rules** (profit target %, daily loss limit %, max drawdown % + **drawdown type: static / trailing / EOD-trailing**, min/max trading days). Plus consistency rule %, weekend-holding, news-trading toggles.
- Behavior: futures presets default to trailing/EOD drawdown and intraday conventions; forex presets default to static drawdown. 2-step exposes Phase 1 + Phase 2 rule sets separately. Saving writes `session.propChallenge` and **activates the rest of this category** for the current source.
- Why: lets a Standard backtester or Strategy user test against any firm's rules ad hoc, and lets a Prop user model the exact evaluation they're attempting.

**Rule Compliance & Utilization** · slug `rule-compliance` · sources: all (needs a configured challenge)
- Chart: status banner (PASS/FAIL/IN PROGRESS + which rule + date + **which phase**). Rule Compliance table per rule (status, worst day, closest call %, times breached, margin). Rule Utilization Timeline: stacked area — daily loss budget used (red), total DD headroom (red, decreasing; respects static vs trailing), distance to profit target (green, climbing). For 2-step, a phase selector. Sub-window: per-rule timeline + near-miss heatmap + rule sensitivity ("if daily limit were 4% instead of 5%, fails on day 7").
- Data: `propChallenge`, `propFirmStatus`, per-day aggregations (trailing-drawdown engine must track running peak intraday/EOD per the configured type).

**Pass Probability & Simulation** · slug `pass-probability` · sources: all (needs a configured challenge)
- Chart: large radial gauge (pass %) computed by Monte Carlo of the trade distribution against the configured rules. Failure-cause breakdown ring (daily loss / max DD / didn't hit target / didn't meet min days / consistency rule). "How to improve" recommendations. **Preset comparison**: same strategy across FTMO / MyForexFunds / The5ers / FundedNext / Topstep / Apex side by side, pass % each. **1-step vs 2-step toggle** shows combined pass probability (P(phase1) × P(phase2 | phase1)). Scenario sliders (risk %, win rate, avg R) re-run live.
- Data: Monte Carlo worker over `propChallenge`; per-phase simulation.

**Variation Optimizer** · slug `variation-optimizer` · sources: all (needs a configured challenge) ⭐
- Purpose: shows **which variations reach the goal** — along TWO axes the user can switch between:
  - **Strategy variations** (pulled from the Strategy Builder parameters + dashboard filters): vary risk %, TP/SL (reuse the excursion replay engine), session filter, setup subset, max trades/day, etc. Rank every variation by pass probability and by expectancy; highlight the variations that cross the pass threshold.
  - **Challenge variations**: hold the strategy fixed and vary the challenge (firm preset, account size, 1-step vs 2-step, futures vs forex) to show **which evaluations this strategy could realistically pass**.
- Chart: a sortable results table + a pass-probability heatmap (variation × pass %), gold-starred cells above the pass threshold; a "best variation" callout. Toggle: *Vary Strategy* / *Vary Challenge* / *Both* (grid).
- Data: Worker-backed (`variationOptimize`) — cartesian sweep of the selected parameter ranges, each re-simulated against the rules. Cap the grid size and warn on large sweeps.
- Why: directly answers the two questions the trader actually has — "what do I change to pass?" and "which challenge should I even attempt?"

**Daily Limit Optimization** · slug `daily-limit-optimization` · sources: all (most useful with a challenge; lighter Standard variant)
- Chart: two sliders — daily profit target and daily loss limit (% or $). The engine re-walks the history day by day; once a day crosses either limit, the rest of that day's trades are skipped. Original vs Optimized panels: Total P&L, Win Rate, Improvement %, Days Saved, Risk Reduction %. Worker-backed.
- Data: per-trade openTime (daily grouping), pnlDollarsNet, startingBalance.
- Why (adopted from last year's standout idea): most blown evaluations come from one bad day where the trader kept going. Quantifies how much a hard daily stop would have saved and how it lifts pass probability.

### 4.8 LIVE DISCIPLINE (only when active source = Live)

> Live mode is the only mode with real execution to grade. These three views compare what the trader *did* against what the strategy *intended*, and surface the behavioral errors eroding the edge.

**Discipline Filter & Score** · slug `discipline-filter` · sources: Live only
- UI + chart: every live trade must carry a `planAdherence` tag — **According to plan / Out of plan / Missed trade** — set at journaling time (enforce on import: untagged live trades are flagged for the user to classify). The view shows: a donut of the three categories, a **Discipline Score (0-100)** derived from the distribution (according-to-plan rewarded, out-of-plan penalized, missed-trade penalized proportionally to the R the plan would have made), and a trend line of the score over time.
- Why: discipline is the single biggest determinant of whether a profitable backtest survives contact with a live account. This makes it measurable.

**Plan-Adherence Equity (Actual vs Strategy)** · slug `plan-adherence-equity` · sources: Live only
- Chart: two equity curves overlaid — **Actual** (what the trader realized) vs **Strategy** (what perfect adherence would have produced, including missed-trade hypothetical R and excluding out-of-plan trades). Shaded gap = the cost (or benefit) of the trader's deviations. Stat cards: "Deviations cost you $X / Y R", "Missed trades cost $Z", "Out-of-plan trades net $W".
- Data: per-trade `planAdherence`, `pnlDollarsNet`, `hypotheticalRr` (for missed-trade rows).
- Why: turns discipline from an abstraction into a dollar figure — the most motivating possible feedback.

**Demon Catcher** · slug `demon-catcher` · sources: Live only ⭐ (Talaria's take on Tom Dante's Demon Finder)
- Concept (from Tom Dante's Demon Finder): track how often the trader commits each common trading error ("demon"); find the demon outpacing the rest and kill it first, then move to the next. Default demons: Poor R:R · Entered too soon · Entered too late · Exited too soon · Exited too late · Trade not in plan · Bet too large · Bet too small · Didn't take the planned trade · Moved SL to BE then stopped · Faded the daily bias · No plan / punted. User can edit/add demons.
- **Unique, visually appealing UI (not a spreadsheet):** render each demon as a **"demon" card** on a dark "arena" — sized/intensified by how often it's been committed (the worst demon literally looms largest and glows red). Tapping a demon on a trade adds a check; the card's "health bar" fills. A **most-active demon** is spotlighted at the top as the "boss to slay next." When a demon goes N trades without recurring, it visibly fades/"dies" with a satisfying state change. A streak warning fires if the **same demon is committed 8 times in a row** ("this one runs deep — consider stepping back"). A small **Survival → Growth → Consistency → Profitability** progress rail frames the whole view (Dante's ladder). Keep it tasteful and motivating, never punitive.
- Data: per-trade `demons[]`; `session.demonLog` rollup. Demon taxonomy is editable in settings.
- Interaction: clicking a demon card lists the trades where it occurred (with screenshots/notes); "kill log" shows demons conquered over time.

### 4.9 STRATEGY SOURCE (only when active source = Strategy)

> The merged-source views and the reconciliation that makes them valid. See Section 1.6 for the reconciliation contract.

**Source Reconciliation** · slug `source-reconciliation` · sources: Strategy only
- UI: the control room for the merge. Sections: **member list** (each source with trade count + date-range coverage bar), **tag-mapping table** (raw tag → canonical, unmapped flagged), **instrument-mapping table**, **date-range mode** (union / intersection / custom) with effective-range readout, **normalization** (R-multiple / % / none) with a scale-mismatch warning, **currency** handling, and a **conflict panel** listing every unresolved issue with a resolve action.
- Behavior: cross-source components stay in a graceful-degraded state (banners, hidden affected sub-visuals) until the relevant conflicts are resolved. Nothing shows wrong numbers.
- Data: `session.mergedSources`.

**Source Attribution Breakdown** · slug `source-attribution` · sources: Strategy only
- Chart: decompose any aggregate by `originSource` — e.g. a stacked bar / waterfall "of +$8,340 net: Standard +X, Prop +Y, Live +Z". Plus a **backtest-vs-live divergence** panel: when the same strategy appears in both, overlay the two equity curves (normalized) and quantify how live execution diverges from the backtest (ties into Discipline). Per-source mini KPI cards.
- Data: per-trade `originSource`; reconciled/normalized values from Section 1.6.

### 4.10 EXPORT

**Report Builder** · slug `report-builder` · sources: all
- UI: templates (Mentor Review / Prop Firm Application / Self-Review / Custom). Page selector (checkboxes for which components). Card-level granular selection. Cover-page options (title, trader name, session, date range, summary). Export format (PDF / HTML / Image gallery). Live preview pane. Generate button.
- Data: read access to all rendered components + HTML-to-PDF rendering.

**Comparison View** · slug `comparison` · sources: all
- UI: pick Session A and Session B. Overlaid equity curves (one chart, two colors). Middle delta column per metric, color-coded. Diff heatmaps for time-of-day and day-of-week. Common-vs-unique trades for overlapping periods. Statistical significance indicator (p-value) for expectancy difference. Especially valuable: same strategy as Standard vs Prop Firm to see what the rules cost.
- Data: two session objects loaded simultaneously; paired significance test.

---

## 5. Build order, performance, acceptance

### 5.1 Build order

1. **Shell + routing + state** — top bar, source selector, filter pills, View-Mode dropdown, side-nav, hash routing, persistence. Stub a content area.
2. **Design tokens + primitives** (Section 3). Build and visually test each primitive in isolation.
3. **Data layer** — implement the `Trade`/`Session` contracts, the aggregation/selector utilities, and the computed metrics (Talaria Score, sub-scores, Day Win Rate, Drawdown Recovery, Rule Adherence) as pure functions in `/utils/`. Memoize.
4. **ESSENTIALS** components (highest visibility).
5. **EXCURSION** components (the advanced metrics — heaviest data dependency on the three arrays).
6. **WHAT-IF SIMULATOR** (interactive, Web Worker for replay).
7. **STATISTICAL** (Monte Carlo + Coin Flip in a Web Worker).
8. **PATTERNS & BEHAVIOR** (Tag Matrix is the flagship — build it carefully).
9. **STRATEGY HEALTH**.
10. **PROP FIRM** (source-locked views).
11. **EXPORT** (Report Builder + Comparison).
12. **Polish pass** — RTL, accessibility, performance, View-Mode correctness across every component.

### 5.2 Performance budget

- Filter change → all visible components re-render within **200ms at 5,000 trades**.
- Talaria Score, Edge Finder, Behavioral detection, Monte Carlo, Sequence Risk reorder, and TP/SL replay run in **Web Workers** — never block the main thread.
- Heavy aggregations memoized via `useMemo`/selector caching.
- Components lazy-render on scroll (Intersection Observer) where a category page stacks several.
- Monte Carlo (incl. Coin Flip) completes under **5s**. 60fps on scroll/filter.

### 5.3 Acceptance criteria

The build is done when:

- Every component in Section 4 renders without errors on sample data across all four sources (where supported).
- The navigation is a single categorized list — **no Basic/Advanced toggle anywhere**.
- PROP CHALLENGE is prop-aware (default in Prop mode, opt-in in Standard/Strategy, auto-on for Live prop accounts); LIVE DISCIPLINE shows only for Live; STRATEGY SOURCE only for Strategy.
- The Strategy source renders all layouts and exposes source-attribution where the trade carries `originSource`.
- All filters + the View-Mode dropdown (Dollars/%/R/Pips/Ticks/Privacy) recompute correctly across every component.
- Talaria Score is deterministic (same inputs → same score) and matches the formula in 4.1.
- The Tag Cross-Analysis Matrix correctly intersects pre-trade × post-trade tags with confidence shading.
- The TP/SL Optimizer and Expectancy Heatmap correctly replay `barHighR[]`/`barLowR[]` (SL checked before TP).
- Sub-windows open/close/pin/export; Escape and click-outside close them; one at a time.
- RTL verified on every component (layout mirrors, charts and digits do not).
- Hash routes are bookmarkable and restore filter + source state.
- Zero console errors on any navigation path. No design-system violations (tokens only, sharp corners, semantic color, typography scale).
- Performance budget in 5.2 met.

### 5.4 Notes on stubbing

If the backtest/journal engine does not yet emit `rulesFollowed`, `plannedRr`, `actualRr*`, `entryQuality`, `exitQuality`, `preTradeTags`, `postTradeTags`, `marketRegime`, or the three excursion arrays, stub them with reasonable defaults and flag each with `// TODO: engine must populate <field>`. Components must **never crash** on a missing field — degrade gracefully (hide the affected sub-visual, show a small "data not available" note).

### 5.5 What not to do

- Do not reintroduce a Basic/Advanced split.
- Do not use browser `localStorage`/`sessionStorage` inside any sandboxed artifact preview; use it only in the real app build.
- Do not hardcode colors — tokens only.
- Do not mirror charts in RTL.
- Do not block the main thread with simulations.
- Do not invent new categories; use the eight in Section 1.2.

---

*End of specification. Build every component listed. The reference PDF shows the intended look of each — match the chart types and layout, render with live data per the contracts above.*
