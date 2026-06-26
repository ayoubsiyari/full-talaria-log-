import React, { useMemo } from "react";
import { buildPathCloudModel, pathToSvgPoints } from "./tradePathCloudUtils.js";

const F = "'Exo 2', sans-serif";

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

  return (
    <div style={{ background: c.bg, border: `1px solid ${c.br}`, padding: "12px 14px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
          gap: 10,
        }}
      >
        <div style={{ fontSize: 9, fontWeight: 700, color: c.tm, letterSpacing: "0.07em" }}>
          TRADE PATH CLOUD
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, color: c.tm, fontFamily: F, fontVariantNumeric: "tabular-nums" }}>
          {model.withPath} / {model.total} with R-path
        </div>
      </div>

      {model.withPath === 0 ? (
        <div
          style={{
            minHeight: 120,
            display: "grid",
            placeItems: "center",
            fontSize: 10,
            fontWeight: 600,
            color: c.tm,
            fontFamily: F,
            textAlign: "center",
            lineHeight: 1.45,
            padding: "8px 12px",
          }}
        >
          No bar R-path data yet. Paths are recorded while trades are open and saved to the session journal on
          close — take a few backtest trades to populate this chart.
        </div>
      ) : (
        <svg
          width="100%"
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ display: "block", background: c.el, border: `1px solid ${c.br}` }}
          role="img"
          aria-label="Trade path cloud"
        >
          {/* Post-exit tint (right half) */}
          <rect x={exitX} y={0} width={w - exitX} height={h} fill="rgba(255,140,66,0.06)" />
          {/* Zero R line */}
          {(() => {
            const range = Math.max(0.25, yExtent.yMax - yExtent.yMin);
            const y0 = 12 + (h - 24) - ((0 - yExtent.yMin) / range) * (h - 24);
            if (y0 < 8 || y0 > h - 8) return null;
            return <line x1={8} x2={w - 8} y1={y0} y2={y0} stroke={c.brH} strokeDasharray="4 4" />;
          })()}
          {/* Percentile band */}
          {bandD ? <path d={bandD} fill="rgba(140,160,255,0.12)" stroke="none" /> : null}
          {/* Individual trade paths */}
          {visiblePaths.map((row, index) => (
            <path
              key={`${row.id ?? index}-${index}`}
              d={pathToSvgPoints(row.path, w, h, yExtent.yMin, yExtent.yMax)}
              fill="none"
              stroke={row.win ? c.gn : c.rd}
              strokeWidth={index % 17 === 0 ? 1.8 : 0.9}
              opacity={index % 17 === 0 ? 0.75 : 0.16}
            />
          ))}
          {/* Median */}
          {medianD ? (
            <path d={medianD} fill="none" stroke={c.acL} strokeWidth={2.4} opacity={0.95} />
          ) : null}
          {/* Exit divider */}
          <line x1={exitX} x2={exitX} y1={8} y2={h - 8} stroke={c.gold} strokeDasharray="5 5" strokeWidth={1.2} />
          <text x={exitX - 4} y={h - 2} fill={c.tm} fontSize={8} fontWeight={900} fontFamily={F} textAnchor="end">
            EXIT
          </text>
          <text x={16} y={12} fill={c.tm} fontSize={8} fontWeight={700} fontFamily={F}>
            In trade
          </text>
          <text x={w - 12} y={12} fill={c.tm} fontSize={8} fontWeight={700} fontFamily={F} textAnchor="end">
            Post-exit
          </text>
        </svg>
      )}
    </div>
  );
}
