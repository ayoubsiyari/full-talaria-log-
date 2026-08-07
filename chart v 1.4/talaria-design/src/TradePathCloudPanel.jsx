import React, { useMemo } from "react";
import { buildPathCloudModel, pathToSvgPoints } from "./tradePathCloudUtils.js";

const F = "var(--font-ui), Helvetica, Arial, sans-serif";

/**
 * Trade Path Cloud — overlay normalized R paths (in-trade + post-exit) for session journal trades.
 */
export default function TradePathCloudPanel({ entries = [], c, maxLines = 120 }) {
  const model = useMemo(() => buildPathCloudModel(entries), [entries]);

  const yExtent = useMemo(() => {
    let min = 0;
    let max = 1;
    for (const p of model.paths) {
      for (const v of p.path) {
        if (!Number.isFinite(v)) continue;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    const pad = Math.max(0.15, (max - min) * 0.12);
    return { yMin: min - pad, yMax: max + pad };
  }, [model.paths]);

  const w = 720;
  const h = 200;
  const exitX = 8 + (model.inPts / Math.max(1, model.totalLen - 1)) * (w - 16);

  const medianD = useMemo(() => {
    if (!model.bands.length) return "";
    const medPath = model.bands.map((b) => b.median);
    return pathToSvgPoints(medPath, w, h, yExtent.yMin, yExtent.yMax);
  }, [model.bands, yExtent]);

  const bandD = useMemo(() => {
    if (!model.bands.length) return "";
    const range = Math.max(0.25, yExtent.yMax - yExtent.yMin);
    const innerW = w - 16;
    const innerH = h - 24;
    const toPt = (y, i) => {
      const x = 8 + (i / Math.max(1, model.bands.length - 1)) * innerW;
      const ny = 12 + innerH - ((y - yExtent.yMin) / range) * innerH;
      return { x, y: ny };
    };
    const upper = model.bands.map((b, i) => toPt(b.p75, i));
    const lower = model.bands.map((b, i) => toPt(b.p25, i));
    const fwd = upper.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
    const back = [...lower]
      .reverse()
      .map((p, i) => `${i === 0 ? "L" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
    return `${fwd} ${back} Z`;
  }, [model.bands, yExtent, w, h]);

  const visiblePaths = model.paths.slice(-maxLines);
  const up = c?.gn || "var(--up)";
  const down = c?.rd || "var(--down)";
  const accent = c?.acL || "var(--accent)";
  const line = c?.brH || "var(--line-strong)";
  const warn = c?.gold || "var(--warn)";
  const muted = c?.tm || "var(--text-faint)";

  return (
    <section data-trades-panel="" data-path-cloud="">
      <header data-trades-panel-h="">
        Trade path cloud
        <em>
          {model.withPath} / {model.total} with R-path
        </em>
      </header>

      {model.withPath === 0 ? (
        <p data-trades-panel-empty="" data-tall="1">
          R-paths appear after open trades record bar excursions — close a few to fill this cloud.
        </p>
      ) : (
        <svg
          width="100%"
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          data-path-cloud-svg=""
          role="img"
          aria-label="Trade path cloud"
        >
          <rect x={exitX} y={0} width={w - exitX} height={h} fill="rgba(255,140,66,0.06)" />
          {(() => {
            const range = Math.max(0.25, yExtent.yMax - yExtent.yMin);
            const y0 = 12 + (h - 24) - ((0 - yExtent.yMin) / range) * (h - 24);
            if (y0 < 8 || y0 > h - 8) return null;
            return <line x1={8} x2={w - 8} y1={y0} y2={y0} stroke={line} strokeDasharray="4 4" />;
          })()}
          {bandD ? <path d={bandD} fill="rgba(48,144,255,0.12)" stroke="none" /> : null}
          {visiblePaths.map((row, index) => (
            <path
              key={`${row.id ?? index}-${index}`}
              d={pathToSvgPoints(row.path, w, h, yExtent.yMin, yExtent.yMax)}
              fill="none"
              stroke={row.win ? up : down}
              strokeWidth={index % 17 === 0 ? 1.8 : 0.9}
              opacity={index % 17 === 0 ? 0.75 : 0.16}
            />
          ))}
          {medianD ? (
            <path d={medianD} fill="none" stroke={accent} strokeWidth={2.4} opacity={0.95} />
          ) : null}
          <line x1={exitX} x2={exitX} y1={8} y2={h - 8} stroke={warn} strokeDasharray="5 5" strokeWidth={1.2} />
          <text x={exitX - 4} y={h - 2} fill={muted} fontSize={8} fontWeight={700} fontFamily={F} textAnchor="end">
            EXIT
          </text>
          <text x={16} y={12} fill={muted} fontSize={8} fontWeight={650} fontFamily={F}>
            In trade
          </text>
          <text x={w - 12} y={12} fill={muted} fontSize={8} fontWeight={650} fontFamily={F} textAnchor="end">
            Post-exit
          </text>
        </svg>
      )}
    </section>
  );
}
