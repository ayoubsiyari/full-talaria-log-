# Talaria Dashboard — Phase 1 (MVP)

> **For: Codex.** This is the first of three build phases. Phase 1 delivers a working dashboard: the app shell, the reusable primitives, the data layer, and the two most important component categories — **ESSENTIALS** and **EXCURSION (MAE/MFE)**. After Phase 1 a trader can load a session and get real analytical value. Phases 2 and 3 add the statistical, behavioral, prop-firm, and export layers on top of this foundation without changing anything built here.
>
> Build strictly to this document. Where it is silent, follow the Talaria design system (Section 2) and keep it consistent. The companion reference PDF shows the intended look of each component — match the chart types and layout, render with live data per the contracts here.

---

## Phase 1 scope

| Build in Phase 1 | Deferred to later phases |
|---|---|
| App shell (top bar, side-nav, routing, state) | STATISTICAL category → Phase 2 |
| Design tokens + all shared primitives | PATTERNS & BEHAVIOR → Phase 2 |
| Data layer + computed metrics | STRATEGY HEALTH → Phase 2 |
| **ESSENTIALS** (19 components, incl. Performance Highlights + Quant KPI Strip) | PROP CHALLENGE → Phase 3 |
| **EXCURSION (MAE/MFE)** (15 components) | EXPORT (Report Builder, Comparison) → Phase 3 |
| Standard + Live + Strategy sources | Prop Firm source full wiring → Phase 3 |

The navigation must already show **all ten categories** (greyed/disabled for the not-yet-built ones) so the structure is locked from day one and Phases 2-3 only fill in content.

---

## 1. Architecture (build this first)

### 1.1 Data sources

Every view reads trades from **one active source**, chosen in the top bar:

| Source | Meaning |
|---|---|
| **Standard** | Free-form backtest. "Did the strategy make money?" |
| **Prop Firm** | Backtest under prop firm rules. (Selector present in Phase 1; full Prop-Firm views land in Phase 3.) |
| **Live** | Real trades from a connected broker, imported near-real-time. |
| **Strategy** | A merged dataset combining any subset of the above under one strategy name; trades carry `originSource`. |

In Phase 1, wire **Standard, Live, and Strategy** fully. The Prop Firm option appears in the selector but its dedicated views are stubbed until Phase 3 — when Prop Firm is selected, the ESSENTIALS/EXCURSION components still render normally (a prop firm backtest is still a set of trades).

### 1.2 Single categorized navigation — NO Basic/Advanced split

Build the full ten-category side-nav now. Phase-1 categories are active; the rest render as disabled/greyed items with a small "coming soon" affordance so the IA is locked.

```
ESSENTIALS                          ← BUILD IN PHASE 1
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

EXCURSION (MAE / MFE)               ← BUILD IN PHASE 1
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

WHAT-IF SIMULATOR                   ← greyed (Phase 2)
STATISTICAL                         ← greyed (Phase 2)
PATTERNS & BEHAVIOR                 ← greyed (Phase 2)
STRATEGY HEALTH                     ← greyed (Phase 2)
PROP CHALLENGE (prop-aware)         ← greyed (Phase 3)
LIVE DISCIPLINE (Live only)         ← greyed (Phase 3)
STRATEGY SOURCE (Strategy only)     ← greyed (Phase 3)
EXPORT                              ← greyed (Phase 3)
```

**Navigation behavior:** collapsible groups; active item gets 3px left accent border + dim-blue bg + label in `acL`; active component name shows as a breadcrumb in the top bar (`Talaria › Equity Curve`); persist last-viewed component in `localStorage` (default `Talaria Score`); hash routing `#/dashboard/<category>/<component-slug>` for bookmarkable views.

### 1.3 Shared shell

A single shell wraps every component:

- **Top bar:** logo, source selector, session/dataset selector, **persistent Current Balance pill** (respects Privacy mode), **Live freshness indicator** ("Updated Xs ago" / "Live"), filter pills, View-Mode dropdown, (Compare + Export buttons present but disabled until Phase 3), breadcrumb.
- **Filter pills (affect every component):** Symbol, Result (All/Win/Loss), Setup tag, Date range, Session, Gross/Net toggle, Session-Warning include/exclude. Changing any filter recomputes every visible component within **200ms at 5,000 trades**.
- **View-Mode dropdown (affects all monetary displays):** Dollars (default) / Percentage / R-Multiple / Pips / Ticks / Privacy. Privacy replaces currency with `***`, keeps charts/percentages.
- **Left side-nav:** the categorized list above.
- **Content area:** the active component, full-width. Navigation is a content swap, not a reload; all state persists.

### 1.4 Data contracts

Build to these shapes. If the engine doesn't yet emit a field, stub it with a sensible default and flag `// TODO: engine must populate <field>`. Components must never crash on a missing field — degrade gracefully (hide the affected sub-visual, show a small "data not available" note).

```typescript
type Source = 'standard' | 'propFirm' | 'live' | 'strategy';

interface Trade {
  id: string;
  source: Source;
  originSource?: Source;          // for Strategy-merged datasets
  symbol: string;
  side: 'long' | 'short';
  openTime: string;               // ISO 8601
  closeTime: string;
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnlDollarsNet: number;
  pnlDollarsGross: number;
  commissionTotal: number;
  swap: number;
  currency: string;

  plannedRr: number;
  actualRrGross: number;
  actualRrNet: number;
  plannedRiskPct: number;

  // excursion (in R-multiples from first entry)
  maeR: number;
  mfeR: number;
  totalMfeR: number;
  captureRatio: number;           // actualRrNet / totalMfeR * 100
  wouldHaveWon: boolean;          // post_mfe_from_entry_r >= plannedRr * 0.5

  // the three arrays (entry → 50 bars post-exit, in R)
  barCloseR: number[];
  barHighR: number[];
  barLowR: number[];
  postCheckpoints?: { bar: number; r: number }[];

  setupTag: string;               // "FVG"|"OB"|"Breaker"|"MSS"|"IFVG"
  preTradeTags: string[];         // used in Phase 2; collect now
  postTradeTags: string[];        // used in Phase 2; collect now

  entryQuality: number;           // 0-100 (Phase 2 uses heavily; store now)
  exitQuality: number;

  rulesFollowed: boolean;         // Phase 2 uses; store now
  rulesViolated: string[];

  numEntries: number;
  numTps: number;
  beEnabled: boolean;
  beTriggered: boolean;
  trailEnabled: boolean;
  trailActivated: boolean;
  slTpModifications: { field: 'sl'|'tp'; from: number; to: number; time: string }[];
  partialExits: { fraction: number; price: number; time: string }[];

  marketRegime: { trend: 'up'|'down'|'range'; volatility: 'low'|'normal'|'high'; session: 'asian'|'london'|'ny-am'|'ny-pm'|'overlap' };
  nearbyNewsEvent?: string | null;
  notes?: string;
  screenshotUrl?: string;
}

interface Session {
  id: string;
  name: string;
  source: Source;
  startingBalance: number;
  currentBalance: number;
  leverage: number;
  currency: string;
  equityCurve: number[];
  maxDrawdownDollars: number;
  maxDrawdownPct: number;
  instruments: Record<string, { trades: number }>;
  trades: Trade[];

  talariaScore: number;
  talariaScoreHistory: { date: string; score: number }[];
  subScores: { profitability: number; risk: number; consistency: number; discipline: number };

  // Phase 3 fields — define now, populate later:
  propFirmRules?: object;
  propFirmStatus?: object;
  userGoals?: { monthlyProfitTarget: number; weeklyTradesTarget: number; winRateTarget: number; maxDrawdownLimit: number };
  userAnnotations?: { tradeIndex: number; text: string }[];
}
```

### 1.5 Computed metrics (pure functions in `/utils/`)

Build these now; Phase 1 components depend on them:

- **talariaScore(session)** → `0.30*profitability + 0.30*risk + 0.20*consistency + 0.20*discipline`. Profitability from profit factor (cap 3.0→100) + net return %. Risk = `100 - maxDDpct*5` floored at 0. Consistency = `%profitableWeeks*0.6 + (100 - normStdDev)*0.4`. Discipline = `% trades with rulesFollowed === true`. Cache on session.
- **subScores(session)** → the four 0-100 components above.
- **dayWinRate(trades)** → % of trading days that closed net green.
- **drawdownStats(trades)** → max DD %, avg recovery time (trades), worst recovery, full list of drawdown periods, **Ulcer Index** (RMS of drawdown depths).
- Standard aggregations: win rate, profit factor, expectancy (mean actualRrNet), avg R, avg win/loss, per-symbol / per-session / per-weekday rollups.
- **`metrics.ts` risk-adjusted library** (build in Phase 1 — the Quant KPI Strip and Consistency depend on it): **Sharpe** (mean/stdev of period returns × √periodsPerYear), **Sortino** (downside-deviation denominator), **Calmar** (CAGR / maxDDpct), **CAGR** ((end/start)^(365/days)−1), **Kelly %** (W − (1−W)/R), **SQN** (√N × mean(R)/stdev(R)), **Recovery Factor** (net profit / maxDD$). Single source of truth — every component pulls from here, no ad-hoc recomputation.

Memoize all of these.

---

## 2. Design system (use everywhere)

```
Font:        Exo 2. Tabular-nums on every number.
Backgrounds: bg #07080E · dark #0A0C14 · well #060710 · surface #0E1220
Borders:     br #1A2030 · brHover #2A3447
Text:        tx #E8EEF8 · ts #8C99B0 · tm #5A6478
Accents:     blue #2643F7 · blueLight #4A6AFF (active/links)
Semantic:    green #00D4A1 (profit/win) · red #FF5068 (loss) · gold #C9A84C (warning)
Extra:       cyan #36C5D4 · orange #FF8C42 · purple #9B6DFF
```

Sharp corners (radius 0). No card shadows (hover = border brightens, no lift/scale). Gradient-fade dividers between sections. Color is semantic only. Typography scale: 8px micro / 10px body / 14px title / 16px sub-number / 24px hero. Section labels 8px weight 800 uppercase. SVG charts with viewBox; numbers right-aligned, labels start-aligned. RTL: mirror layout, never mirror charts, keep digits LTR.

---

## 3. Shared primitives (build before components, in `/components/primitives/`)

- `<GaugeRing score color label sublabel />`
- `<Sparkline values color />`
- `<DotTrail outcomes />`
- `<StackedRatioBar segments />`
- `<ProgressBar value target zones />`
- `<BoxPlotMini stats />`
- `<HeatmapCell value confidence />`
- `<KpiCard label value color visual />`
- `<ChartFrame title actions>` — standard card chrome: 32px header (icon + title + ⋯), 16px body padding, optional footer.
- `<SubWindow title onClose onPin>` — draggable/resizable modal (default 720×560, min 480×400, max 90vw), header (title + pin + close), footer (Export PNG/CSV/JSON + Copy + Close), Escape/click-outside to close, one at a time, 150ms fade+scale. Several Phase-1 components open one for depth.

Every numeric formatter respects the active View Mode.

---

## 4. Phase 1 components

> Each: chart type · data read · interactions. Sources = all (Standard/Prop Firm/Live/Strategy) unless noted. Slugs are for routing. Match the reference PDF for look.

### 4.1 ESSENTIALS

**Talaria Score** `talaria-score` — large GaugeRing 0-100, zones 0-40 red / 41-70 gold / 71-100 green, center number + label. Add a **tier sublabel** (Developing / Proficient / Strong / Elite) derived from the score (replaces last year's separate star-rating). Data: `session.talariaScore`. Double-click → breakdown sub-window.

**Sub-Score Breakdown** `sub-scores` — four mini GaugeRings (Profitability, Risk, Consistency, Discipline). Data: `session.subScores`. Hover → tooltip of feeding metrics.

**Strategy Radar** `strategy-radar` — 6-axis radar (Profitability, Consistency, Risk Control, Frequency, Discipline, Edge), filled blue polygon, rings at 33/66/100%. Data: sub-scores + frequency (trades/period) + edge (expectancy normalized).

**KPI Strip** `kpi-strip` — 4×2 grid of KpiCard: Net P&L (sparkline), Return % (progress bar to goal), Trade Win Rate (dot trail), Day Win Rate (dot trail), Profit Factor (stacked ratio bar), Avg R (box-plot mini), Max Drawdown (underwater sparkline), Trades/Avg Duration (duration histogram). Double-click → 1-year history sub-window.

**Quant KPI Strip** `quant-kpi` — a row of mini-cards with sparklines for the risk-adjusted / return metrics: **Sharpe · Sortino · Calmar · CAGR · Kelly % · SQN · Recovery Factor · Ulcer Index**. All pulled from `metrics.ts` (Section 1.5) — never recomputed ad hoc. Color-banded healthy/marginal/poor. This is the explicit home for the professional metrics.

**Equity Curve** `equity-curve` — line of balance after each trade, green rising / red falling segments, red drawdown shading vs running peak, trade-marker dots by symbol. Tabs: Equity / Cumulative P&L / Returns % / Rolling 30-trade / vs Buy & Hold / vs Random Entry. **Granularity selector (Daily/Weekly/Monthly/Quarterly/Yearly) + chart-type (Area/Line) + accumulation (Cumulative/Per-period) toggles** (from last year's Portfolio Growth). Brush selector to zoom; click to drop annotation; hover dot → tooltip. Data: `session.equityCurve[]`, per-trade pnl/symbol/timestamps; optional benchmark.

**Cumulative R Curve** `cumulative-r` — running sum of `actualRrNet`, area fill, zero baseline, endpoint `+X.XR` label. Sizing-independent edge picture.

**Drawdown** `drawdown` — underwater curve (0 top, red fill down). Stats: max DD %, avg recovery (trades), worst recovery. Sub-window: every drawdown (date, depth, duration, recovery trades).

**Win / Loss Distribution** `win-loss` — donut sized by outcome counts (green/red/grey), center win-rate %, legend counts; plus stacked ratio bar of avg-win vs avg-loss size.

**Balance Waterfall** `waterfall` — Start (blue) → Wins (green up) → Losses (red down) → Commission (red) → Swap (red) → End (blue), connector lines, value labels on Start/End. Makes fees visible.

**Performance Calendar** `performance-calendar` — hour-of-day (rows) × day-of-week (cols) heatmap, cell color = P&L. Sub-window: recolor by Wins/Losses/Avg R/Win rate/cross-by-symbol. Click cell → filter dashboard.

**Daily P&L Heatmap** `daily-pnl` — 6-week × 7-day grid, cell bg = daily P&L, trade-count number inside, **weekly-total column on the right** (from last year's calendar). Hover → day breakdown popover. (Prop-firm near-breach borders wired in Phase 3.)

**Performance by Instrument / Session / Day** `breakdowns` — three horizontal-bar panels (symbol / session / weekday); each row = P&L bar + trade-count sub-bar + win-rate badge. Click row → filter.

**Instrument Bubble** `instrument-bubble` — scatter, x = win rate, y = expectancy (R), bubble size = trade count, color by expectancy sign, dashed zero line. One-glance keep/cut.

**Streaks & Records** `streaks` — dot-trail visuals for longest win/loss streaks, current streak, best/worst day (mini equity curves), drawdown recovery records.

**Consistency** `consistency` — Sharpe (labeled "Consistency Score") + % profitable weeks (bar) + weekly-returns std-dev (violin) + return-to-drawdown ratio across 7/30/180/365-day windows (line).

**Trade Journal** `trade-journal` — table of last 10-20 trades: #, date, symbol, side, R, P&L, exit reason, tag, **mini equity-curve sparkline** per row (from `barCloseR[]`), **rule-adherence dot** (green/gold/red), **inline note icon + screenshot-count badge** per row (from last year's build). Hover row → highlight on equity curve. Click → trade detail sub-window with notes + screenshot.

**Best & Worst Trades** `best-worst` — two ranked lists side by side: Top 5 winners (green), Top 5 losers (red); each row symbol + R + $ + dominant tag.

**Performance Highlights** `performance-highlights` — slim always-visible insight strip of 3-4 chips (Best Setup / Most Profitable Instrument / Best Time of Day / Best Day of Week), each with win rate + trade count + P&L. Detection shared with Edge Finder (Phase 2); in Phase 1 compute directly (best subgroup by P&L, min sample 20). Click a chip → (Phase 2) jump to Edge Finder. Adopted from last year's build.

### 4.2 EXCURSION (MAE / MFE)

> All read `barCloseR[]`, `barHighR[]`, `barLowR[]` + scalar excursion fields. Respect Gross/Net toggle. Session-Warning filter excludes boundary-crossover trades from post-exit analytics.

**Session Stat Cards (7)** `session-stats` — 7 cards (deliberately grouped): BALANCE (green if >start else red), NET PnL (signed), WIN RATE (gold), PROFIT FACTOR (green if >1 else red), EXPECTANCY (mean actualRrNet, green if +), MAX DD (red), COMMISSION (orange).

**Excursion Stat Cards (7)** `excursion-stats` — 7 cards: AVG MAE (red), AVG MFE (green), CAPTURE (gold 0-100), WIN MAE 90th (gold), MGMT GAP (red, mean mfeR(wins) − mean actualRrGross(wins)), EXIT GAP (orange, mean totalMfeR − mean mfeR for wins), RECOVERY (cyan, % losers wouldHaveWon).

**What-If Bars** `whatif-bars` — 3 bars: "What You Got" (gold, avg actualRr winners), "Available During" (cyan, avg mfeR), "Available Total" (orange, avg totalMfeR). Red arrow (mgmt gap) between 1-2, orange arrow (exit gap) between 2-3. Gross/Net affects bar 1.

**Capture Ratio Histogram** `capture-hist` — 5 buckets (0-20…80-100%), colored worst→best (red/orange/gold/green/teal), count label per bar. Data: per-winner captureRatio.

**Post-Exit MFE Curve** `post-exit-mfe` — 2 lines over bars 0-50 after exit: winners (green) + losers (red) avg additional MFE in R, fills, dashed gold plateau line where slope <25% of avg.

**Post-Exit MFE by Setup** `post-exit-by-setup` — multi-line, one per setup (FVG green / OB cyan / Breaker orange / MSS purple / IFVG gold), winners only, bars 0-50. Steepest = hold longer.

**MAE Distribution** `mae-dist` — stacked histogram, buckets 0-.2…>1.2 R, green winners (bottom) + red losers (top). Bucket where green stops = optimal SL.

**MFE Distribution** `mfe-dist` — stacked histogram, buckets 0-.5…>3 R, green/red. Losers with MFE>1R = were winning before reversing.

**During vs Total MFE Scatter** `during-total-scatter` — x = mfeR, y = totalMfeR; circles winners / X losers; dashed gold y=x diagonal.

**MAE vs MFE Scatter** `mae-mfe-scatter` — x = MAE (negative-right), y = MFE; winners bottom-right, losers top-left; y=−x reference. Filter tabs: All / Wins / Losses / By pre-trade tag / By post-trade tag.

**Trade Path Cloud** `path-cloud` — overlay all trades, x = normalized bars (0-50 during resampled, 50-100 post-exit), y = R from entry. Thin green/red lines, thick median per group, 25-75 percentile bands, dashed gold exit divider at bar 50, faint orange post-exit tint. Data: `barCloseR[]` resampled to 50 pts + post-exit appended.

**Box Plots at Key Moments** `box-plots` — two side-by-side box-plot charts (winners | losers), six stages each. Winners: MAE(red) MFE(green) Exit(gold) Post+10/25/50(orange). Losers: MFE(green) MAE(red) Exit(red) Post+10/25/50(cyan). Box = 25-75 pct, whiskers = range, diamond = mean, dashed gold divider between exit and post-exit.

**Setup Comparison** `setup-comparison` — grouped bar, one cluster per setup, 5 bars: MAE(red) ActualRR(gold) DuringMFE(cyan) TotalMFE(orange) Capture%-scaled(purple). X labels: setup + trade count + win rate + capture %.

**Losers Recovery Rate** `recovery-rate` — per-setup back bar (total losers, faded red) + front bar (recovered, orange) + % label. High % = stop too tight for that setup.

**Per-Instrument Breakdown Table** `instrument-table` — table, one row per symbol + totals: Pair, Trades, Win Rate, Net PnL, Avg RR, Avg MAE, Avg MFE, Capture %, Commission. Pair colored by accent.

**Trade Duration Analysis** `trade-duration` — three linked bar charts sharing one duration-bucket scale (1-2m … 4h+): P&L by duration, trade count by duration, win rate by duration, with median + average reference lines. Refined from last year's most-polished page. Data: per-trade duration + pnl + outcome.

---

## 5. Phase 1 build order

1. Shell + routing + state (top bar, source selector, filter pills, View-Mode, side-nav with all 8 categories — Phase-1 active, rest greyed, hash routing, persistence).
2. Design tokens + all primitives (Section 3), tested in isolation.
3. Data layer (`Trade`/`Session` contracts, aggregation selectors, computed metrics in `/utils/`, memoized).
4. ESSENTIALS (19 components, incl. Performance Highlights + Quant KPI Strip).
5. EXCURSION (16 components, incl. Trade Duration Analysis).
6. Phase-1 polish: RTL, View-Mode correctness, 200ms filter budget, lazy-render on scroll, zero console errors.

## 6. Phase 1 acceptance criteria

- Shell renders; source selector switches Standard/Live/Strategy (Prop Firm selectable, ESSENTIALS/EXCURSION still render for it).
- Side-nav shows all ten categories; Phase-1 ones active, others greyed with "coming soon"; **no Basic/Advanced toggle**.
- All 35 Phase-1 components render without errors on sample data.
- Filters + View-Mode (Dollars/%/R/Pips/Ticks/Privacy) recompute correctly across all of them.
- Talaria Score deterministic and matches the formula.
- Excursion components correctly read `barCloseR/HighR/LowR`; Gross/Net and Session-Warning filters work.
- Sub-windows open/close/pin/export; Escape + click-outside close; one at a time.
- Hash routes bookmarkable; restore filter + source state.
- RTL verified (layout mirrors, charts/digits do not). Tokens only, sharp corners, semantic color, typography scale.
- Filter change re-renders within 200ms at 5,000 trades; 60fps on scroll.
- Missing-field stubs degrade gracefully, flagged with `// TODO`.

*End of Phase 1. Do not build Phase 2/3 categories yet beyond the greyed nav placeholders.*
