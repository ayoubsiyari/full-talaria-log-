/** Journal trade row shape from session state (chart order-manager tradeJournal). */
export type PriceBehaviorTrade = Record<string, unknown> & {
  tradeId?: string | number;
  id?: string | number;
  ticker?: string;
  symbol?: string;
  direction?: string;
  type?: string;
  setup?: string;
  pnl?: number;
  netPnL?: number;
  realizedPnL?: number;
  rr?: number;
  rMultiple?: number | string;
  rewardToRiskRatio?: number | string;
  mae_r?: number | string;
  mfe_r?: number | string;
  capture_ratio?: number | string;
  total_mfe_r?: number | string;
  management_gap?: number | string;
  exit_timing_gap?: number | string;
  would_have_won?: boolean;
  exit_confirmed?: boolean;
  bar_high_r?: number[];
  bar_low_r?: number[];
  bar_close_r?: number[];
  post_exit_bar_high_r?: number[];
  post_exit_bar_low_r?: number[];
  post_exit_bar_close_r?: number[];
  post_checkpoints?: Array<{ bar?: number; post_mfe_r?: number; post_mae_r?: number }>;
  strategy_variables?: Array<{ name?: string; value?: string }> | null;
  post_strategy_variables?: Array<{ name?: string; value?: string }> | null;
  openTime?: number;
  closeTime?: number;
  entryTime?: number;
  exitTime?: number;
};

export type ExcursionSeries = {
  labels: string[];
  favorable: (number | null)[];
  adverse: (number | null)[];
  close: (number | null)[];
  exitBarIndex: number;
  inTradeBars: number;
  postExitBars: number;
  postExitComplete: boolean;
  resultR: number;
  mfeR: number;
  maeR: number;
  captureRatio: number | null;
  totalMfeR: number | null;
  managementGap: number | null;
  exitTimingGap: number | null;
  wouldHaveWon: boolean;
  exitConfirmed: boolean | null;
};

export type PriceBehaviorSessionSummary = {
  total: number;
  withPath: number;
  withPostExit: number;
  avgCapturePct: number | null;
  wouldHaveWonPct: number | null;
  avgMfeR: number | null;
  avgMaeR: number | null;
};

export type MaeMfeScatterPoint = {
  x: number;
  y: number;
  win: boolean;
  ticker: string;
  tradeKey: string;
};

export function pbNum(v: unknown): number {
  const n = Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export function pbNumArr(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => pbNum(x));
}

export function tradeKey(t: PriceBehaviorTrade): string {
  return String(t.tradeId ?? t.id ?? "");
}

export function tradePnl(t: PriceBehaviorTrade): number {
  return pbNum(t.pnl ?? t.netPnL ?? t.realizedPnL);
}

export function tradeResultR(t: PriceBehaviorTrade): number {
  return pbNum(t.rr ?? t.rMultiple ?? t.rewardToRiskRatio);
}

export function tradeHasExcursionPath(t: PriceBehaviorTrade): boolean {
  return (
    pbNumArr(t.bar_high_r).length > 0 ||
    pbNumArr(t.bar_close_r).length > 0 ||
    pbNumArr(t.bar_low_r).length > 0
  );
}

function runningMax(values: number[], seed = 0): number[] {
  let peak = seed;
  return values.map((v) => {
    peak = Math.max(peak, v);
    return peak;
  });
}

function padToLen(arr: number[], len: number): number[] {
  if (len <= 0) return [];
  const out = arr.slice(0, len);
  while (out.length < len) out.push(out[out.length - 1] ?? 0);
  return out;
}

export function buildExcursionSeries(trade: PriceBehaviorTrade): ExcursionSeries | null {
  const inHigh = pbNumArr(trade.bar_high_r);
  const inLow = pbNumArr(trade.bar_low_r);
  const inClose = pbNumArr(trade.bar_close_r);
  const postHigh = pbNumArr(trade.post_exit_bar_high_r);
  const postLow = pbNumArr(trade.post_exit_bar_low_r);
  const postClose = pbNumArr(trade.post_exit_bar_close_r);

  const inLen = Math.max(inHigh.length, inLow.length, inClose.length, 0);
  if (inLen === 0 && postHigh.length === 0 && postClose.length === 0) return null;

  const highIn = padToLen(inHigh, inLen);
  const lowIn = padToLen(inLow, inLen);
  const closeIn = padToLen(inClose, inLen);

  const favIn = runningMax(highIn);
  const advIn = runningMax(lowIn);

  const lastFav = favIn.length ? favIn[favIn.length - 1] : 0;
  const lastAdv = advIn.length ? advIn[advIn.length - 1] : 0;

  const favPost = runningMax(postHigh, lastFav);
  const advPost = runningMax(postLow, lastAdv);

  const closePost = postClose;
  const totalLen = inLen + Math.max(favPost.length, closePost.length, 0);

  const favorable: (number | null)[] = [];
  const adverse: (number | null)[] = [];
  const close: (number | null)[] = [];
  const labels: string[] = [];

  for (let i = 0; i < totalLen; i += 1) {
    if (i < inLen) {
      labels.push(String(i + 1));
      favorable.push(favIn[i] ?? null);
      adverse.push(-(advIn[i] ?? 0));
      close.push(closeIn[i] ?? null);
    } else {
      const pi = i - inLen;
      labels.push(`+${pi + 1}`);
      favorable.push(favPost[pi] ?? null);
      adverse.push(-(advPost[pi] ?? 0));
      close.push(closePost[pi] ?? null);
    }
  }

  const exitBarIndex = inLen > 0 ? inLen - 1 : 0;
  const storedCapture = pbNum(trade.capture_ratio);
  const mfeR = pbNum(trade.mfe_r) || (favIn.length ? Math.max(...favIn) : 0);
  const maeR = Math.abs(pbNum(trade.mae_r)) || (advIn.length ? Math.max(...advIn) : 0);
  const totalMfeStored = pbNum(trade.total_mfe_r);
  const totalMfeR =
    totalMfeStored > 0
      ? totalMfeStored
      : Math.max(mfeR, favPost.length ? Math.max(...favPost) : 0);
  const resultR = tradeResultR(trade);
  const captureRatio =
    storedCapture > 0
      ? storedCapture
      : totalMfeR > 0 && resultR !== 0
        ? resultR / totalMfeR
        : mfeR > 0 && resultR !== 0
          ? resultR / mfeR
          : null;

  return {
    labels,
    favorable,
    adverse,
    close,
    exitBarIndex,
    inTradeBars: inLen,
    postExitBars: favPost.length,
    postExitComplete: postHigh.length > 0 || postClose.length > 0,
    resultR,
    mfeR,
    maeR,
    captureRatio,
    totalMfeR: totalMfeR > 0 ? totalMfeR : null,
    managementGap: Number.isFinite(pbNum(trade.management_gap)) ? pbNum(trade.management_gap) : null,
    exitTimingGap: Number.isFinite(pbNum(trade.exit_timing_gap)) ? pbNum(trade.exit_timing_gap) : null,
    wouldHaveWon: trade.would_have_won === true,
    exitConfirmed: typeof trade.exit_confirmed === "boolean" ? trade.exit_confirmed : null,
  };
}

export function buildSessionSummary(trades: PriceBehaviorTrade[]): PriceBehaviorSessionSummary {
  const total = trades.length;
  const withPath = trades.filter(tradeHasExcursionPath).length;
  const withPostExit = trades.filter((t) => pbNumArr(t.post_exit_bar_high_r).length > 0).length;
  const captures: number[] = [];
  let wouldHaveWon = 0;
  let mfeSum = 0;
  let maeSum = 0;
  let mfeN = 0;
  let maeN = 0;

  trades.forEach((t) => {
    const series = buildExcursionSeries(t);
    if (series?.captureRatio != null && Number.isFinite(series.captureRatio)) {
      captures.push(series.captureRatio);
    }
    if (t.would_have_won === true) wouldHaveWon += 1;
    const mfe = pbNum(t.mfe_r);
    const mae = Math.abs(pbNum(t.mae_r));
    if (mfe !== 0 || series?.mfeR) {
      mfeSum += mfe || series?.mfeR || 0;
      mfeN += 1;
    }
    if (mae !== 0 || series?.maeR) {
      maeSum += mae || series?.maeR || 0;
      maeN += 1;
    }
  });

  return {
    total,
    withPath,
    withPostExit,
    avgCapturePct: captures.length ? (captures.reduce((a, b) => a + b, 0) / captures.length) * 100 : null,
    wouldHaveWonPct: total > 0 ? (wouldHaveWon / total) * 100 : null,
    avgMfeR: mfeN > 0 ? mfeSum / mfeN : null,
    avgMaeR: maeN > 0 ? maeSum / maeN : null,
  };
}

export function buildMaeMfeScatter(trades: PriceBehaviorTrade[]): MaeMfeScatterPoint[] {
  return trades
    .map((t) => {
      const mae = pbNum(t.mae_r);
      const mfe = pbNum(t.mfe_r);
      if (mae === 0 && mfe === 0) return null;
      return {
        x: mae <= 0 ? mae : -Math.abs(mae),
        y: mfe,
        win: tradePnl(t) > 0,
        ticker: String(t.ticker || t.symbol || "—"),
        tradeKey: tradeKey(t),
      };
    })
    .filter((p): p is MaeMfeScatterPoint => p != null);
}

export function formatStrategyVars(
  vars: PriceBehaviorTrade["strategy_variables"]
): string {
  if (!Array.isArray(vars) || vars.length === 0) return "—";
  return vars
    .map((v) => {
      const name = String(v?.name || "").trim();
      const val = String(v?.value ?? "").trim();
      if (!name && !val) return "";
      return val ? `${name}: ${val}` : name;
    })
    .filter(Boolean)
    .join(" · ");
}

export function sortTradesForExplorer(trades: PriceBehaviorTrade[]): PriceBehaviorTrade[] {
  return [...trades].sort((a, b) => {
    const ta = pbNum(a.closeTime ?? a.exitTime);
    const tb = pbNum(b.closeTime ?? b.exitTime);
    return tb - ta;
  });
}
