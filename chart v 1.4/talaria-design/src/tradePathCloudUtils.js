/** Parse R-path arrays from journal rows (array or JSON string from CSV). */
export function parseNumArray(val) {
  if (Array.isArray(val)) {
    return val.map((x) => Number(x)).filter(Number.isFinite);
  }
  if (typeof val === "string" && val.trim()) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.map((x) => Number(x)).filter(Number.isFinite);
      }
    } catch (_) {
      /* ignore */
    }
  }
  return [];
}

function pickRawField(j, snake, camel) {
  if (!j || typeof j !== "object") return undefined;
  if (j[snake] != null && j[snake] !== "") return j[snake];
  if (j[camel] != null && j[camel] !== "") return j[camel];
  return undefined;
}

/**
 * Six excursion series keys: snake + camel for live tail and archive prefix.
 * Consumer reconstructs archive ‖ tail exactly once when archive is present.
 */
export const EXCURSION_SERIES_KEYS = [
  {
    snake: "bar_close_r",
    camel: "barCloseR",
    archSnake: "bar_close_r_archive",
    archCamel: "barCloseRArchive",
  },
  {
    snake: "bar_high_r",
    camel: "barHighR",
    archSnake: "bar_high_r_archive",
    archCamel: "barHighRArchive",
  },
  {
    snake: "bar_low_r",
    camel: "barLowR",
    archSnake: "bar_low_r_archive",
    archCamel: "barLowRArchive",
  },
  {
    snake: "post_exit_bar_close_r",
    camel: "postExitBarCloseR",
    archSnake: "post_exit_bar_close_r_archive",
    archCamel: "postExitBarCloseRArchive",
  },
  {
    snake: "post_exit_bar_high_r",
    camel: "postExitBarHighR",
    archSnake: "post_exit_bar_high_r_archive",
    archCamel: "postExitBarHighRArchive",
  },
  {
    snake: "post_exit_bar_low_r",
    camel: "postExitBarLowR",
    archSnake: "post_exit_bar_low_r_archive",
    archCamel: "postExitBarLowRArchive",
  },
];

/**
 * Resolve one excursion series: archive ‖ live tail when archive present;
 * otherwise live/projected/legacy bar_* unchanged. Never mutates `j`.
 */
export function resolveExcursionSeries(j, keySpec) {
  const { snake, camel, archSnake, archCamel } = keySpec;
  const tail = parseNumArray(pickRawField(j, snake, camel));
  const archive = parseNumArray(pickRawField(j, archSnake, archCamel));
  if (archive.length) return archive.concat(tail);
  return tail;
}

/** Path fields stored on session journal / payload_json — kept on analytics list rows. */
export function extractPathFieldsFromJournal(j) {
  if (!j || typeof j !== "object") return {};
  const out = {
    trail_sl_path: parseNumArray(j.trail_sl_path ?? j.trailSlPath),
    mfe_r: Number.isFinite(Number(j.mfe_r ?? j.mfeR)) ? Number(j.mfe_r ?? j.mfeR) : undefined,
    mae_r: Number.isFinite(Number(j.mae_r ?? j.maeR)) ? Number(j.mae_r ?? j.maeR) : undefined,
    rMultiple: Number.isFinite(Number(j.rMultiple ?? j.rr)) ? Number(j.rMultiple ?? j.rr) : undefined,
  };
  for (let i = 0; i < EXCURSION_SERIES_KEYS.length; i += 1) {
    const spec = EXCURSION_SERIES_KEYS[i];
    out[spec.snake] = resolveExcursionSeries(j, spec);
  }
  return out;
}

export function tradeHasPathData(trade) {
  const f = extractPathFieldsFromJournal(trade);
  return (
    f.bar_close_r.length > 0 ||
    f.bar_high_r.length > 0 ||
    f.post_exit_bar_close_r.length > 0
  );
}

function resampleLinear(arr, targetLen) {
  if (!Array.isArray(arr) || !arr.length || targetLen <= 0) return [];
  if (arr.length === 1) return Array(targetLen).fill(arr[0]);
  const out = [];
  for (let i = 0; i < targetLen; i += 1) {
    const pos = (i / Math.max(1, targetLen - 1)) * (arr.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(arr.length - 1, lo + 1);
    const t = pos - lo;
    out.push(arr[lo] * (1 - t) + arr[hi] * t);
  }
  return out;
}

/** Combined normalized path: 50 in-trade + 50 post-exit close R (exit divider at index 50). */
export function buildTradeCloudPath(trade, inPts = 50, postPts = 50) {
  const fields = extractPathFieldsFromJournal(trade);
  const closeIn = fields.bar_close_r;
  const closePost = fields.post_exit_bar_close_r;
  if (!closeIn.length && !closePost.length) return null;

  const inPart = closeIn.length ? resampleLinear(closeIn, inPts) : Array(inPts).fill(0);
  const lastIn = inPart[inPart.length - 1] ?? 0;
  const postPart = closePost.length
    ? resampleLinear(closePost, postPts)
    : Array(postPts).fill(lastIn);

  return [...inPart, ...postPart];
}

export function tradePathIsWin(trade) {
  const pnl = Number(trade?.pnl ?? trade?.netPnL ?? trade?.net_pnl ?? trade?.realizedPnL ?? NaN);
  if (Number.isFinite(pnl)) return pnl >= 0;
  const r = Number(trade?.rMultiple ?? trade?.rr ?? NaN);
  return Number.isFinite(r) ? r >= 0 : true;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

function bandAtIndex(paths, i) {
  const vals = paths.map((p) => p.path[i]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!vals.length) return { median: 0, p25: 0, p75: 0 };
  return {
    median: percentile(vals, 0.5),
    p25: percentile(vals, 0.25),
    p75: percentile(vals, 0.75),
  };
}

/**
 * @param {object[]} entries — analytics journal list rows
 * @returns {{ paths: object[], bands: object[], totalLen: number, inPts: number, withPath: number, total: number }}
 */
export function buildPathCloudModel(entries, opts = {}) {
  const inPts = opts.inPts ?? 50;
  const postPts = opts.postPts ?? 50;
  const totalLen = inPts + postPts;
  const paths = [];
  for (const e of entries || []) {
    const path = buildTradeCloudPath(e, inPts, postPts);
    if (!path) continue;
    paths.push({
      path,
      win: tradePathIsWin(e),
      id: e.trade_id ?? e.tradeId ?? e.id,
      symbol: e.symbol,
    });
  }
  const bands = [];
  for (let i = 0; i < totalLen; i += 1) {
    bands.push(bandAtIndex(paths, i));
  }
  return {
    paths,
    bands,
    totalLen,
    inPts,
    postPts,
    withPath: paths.length,
    total: Array.isArray(entries) ? entries.length : 0,
  };
}

export function pathToSvgPoints(path, width, height, yMin, yMax, padX = 8, padY = 12) {
  const range = Math.max(0.25, yMax - yMin);
  const innerW = Math.max(1, width - padX * 2);
  const innerH = Math.max(1, height - padY * 2);
  return path
    .map((y, i) => {
      const x = padX + (i / Math.max(1, path.length - 1)) * innerW;
      const ny = padY + innerH - ((y - yMin) / range) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${ny.toFixed(2)}`;
    })
    .join(" ");
}
