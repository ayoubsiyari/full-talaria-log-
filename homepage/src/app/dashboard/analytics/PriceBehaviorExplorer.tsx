"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PriceBehaviorScatterChart } from "./PriceBehaviorScatterChart";
import { PriceBehaviorTradeChart } from "./PriceBehaviorTradeChart";
import {
  buildExcursionSeries,
  buildMaeMfeScatter,
  buildSessionSummary,
  formatStrategyVars,
  sortTradesForExplorer,
  tradeHasExcursionPath,
  tradeKey,
  tradePnl,
  tradeResultR,
  type PriceBehaviorTrade,
} from "./priceBehaviorUtils";

function fmtPct(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtR(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}R`;
}

function KpiCell({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bt-os-pb-kpi">
      <div className="bt-os-pb-kpi-label">{label}</div>
      <div className="bt-os-pb-kpi-value">{value}</div>
      {hint ? <div className="bt-os-pb-kpi-hint">{hint}</div> : null}
    </div>
  );
}

export function PriceBehaviorExplorer({ trades }: { trades: PriceBehaviorTrade[] }) {
  const sorted = useMemo(() => sortTradesForExplorer(trades), [trades]);
  const summary = useMemo(() => buildSessionSummary(trades), [trades]);
  const scatter = useMemo(() => buildMaeMfeScatter(trades), [trades]);

  const defaultKey = useMemo(() => {
    const withPath = sorted.find(tradeHasExcursionPath);
    if (withPath) return tradeKey(withPath);
    if (sorted.length) return tradeKey(sorted[0]);
    return "";
  }, [sorted]);

  const [selectedKey, setSelectedKey] = useState(defaultKey);

  useEffect(() => {
    setSelectedKey(defaultKey);
  }, [defaultKey]);

  const selectedTrade = useMemo(
    () => sorted.find((t) => tradeKey(t) === selectedKey) ?? sorted[0] ?? null,
    [sorted, selectedKey]
  );

  const series = useMemo(
    () => (selectedTrade ? buildExcursionSeries(selectedTrade) : null),
    [selectedTrade]
  );

  const onSelect = useCallback((key: string) => setSelectedKey(key), []);

  if (trades.length === 0) {
    return (
      <div className="bt-os-cluster">
        <div className="bt-os-section bt-os-pb-empty">
          <p>No trades in this session yet. Complete backtest trades on the chart to populate price-behavior data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bt-os-cluster bt-os-pb-root">
      <div className="bt-os-section">
        <div className="bt-os-pb-kpi-row">
          <KpiCell label="Trades" value={String(summary.total)} />
          <KpiCell
            label="With R-path"
            value={`${summary.withPath} / ${summary.total}`}
            hint="bar_high_r from chart replay"
          />
          <KpiCell
            label="Post-exit tracked"
            value={`${summary.withPostExit} / ${summary.total}`}
            hint="after full close"
          />
          <KpiCell label="Avg capture" value={fmtPct(summary.avgCapturePct)} />
          <KpiCell label="Would-have-won" value={fmtPct(summary.wouldHaveWonPct)} />
          <KpiCell label="Avg MFE" value={fmtR(summary.avgMfeR)} />
          <KpiCell label="Avg MAE" value={fmtR(summary.avgMaeR)} />
        </div>
      </div>

      <div className="bt-os-section bt-os-pb-split">
        <div className="bt-os-chart-card bt-os-pb-list-card">
          <div className="bt-os-chart-title">
            Trades <span>click to inspect R-path</span>
          </div>
          <div className="bt-os-table-wrap bt-os-pb-list-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Side</th>
                  <th>R</th>
                  <th>MFE</th>
                  <th>Cap</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => {
                  const key = tradeKey(t);
                  const cap = buildExcursionSeries(t)?.captureRatio;
                  const hasPath = tradeHasExcursionPath(t);
                  const pnl = tradePnl(t);
                  const active = key === tradeKey(selectedTrade ?? {});
                  return (
                    <tr
                      key={key || String(t.openTime)}
                      className={active ? "bt-os-pb-row-active" : undefined}
                      onClick={() => setSelectedKey(key)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>{String(t.ticker || t.symbol || "—")}</td>
                      <td>
                        <span
                          className={`bt-os-td-badge ${
                            String(t.direction || t.type || "")
                              .toUpperCase()
                              .includes("SELL") ||
                            String(t.direction || t.type || "").toUpperCase() === "SHORT"
                              ? "bt-os-short"
                              : "bt-os-long"
                          }`}
                        >
                          {String(t.direction || t.type || "—").slice(0, 4)}
                        </span>
                      </td>
                      <td className={pnl >= 0 ? "bt-os-td-pos" : "bt-os-td-neg"}>
                        {tradeResultR(t).toFixed(2)}
                      </td>
                      <td>{fmtR(Number(t.mfe_r))}</td>
                      <td>{cap != null ? `${(cap * 100).toFixed(0)}%` : "—"}</td>
                      <td>
                        <span className={`bt-os-pb-badge ${hasPath ? "bt-os-pb-badge--ok" : ""}`}>
                          {hasPath ? "curve" : "scalar"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bt-os-chart-card bt-os-pb-detail-card">
          <div className="bt-os-chart-title">
            {selectedTrade ? (
              <>
                {String(selectedTrade.ticker || selectedTrade.symbol || "Trade")} ·{" "}
                {String(selectedTrade.setup || "General")}
                {series && !series.postExitComplete ? (
                  <span className="bt-os-pb-warn"> · post-exit incomplete</span>
                ) : null}
              </>
            ) : (
              "Select a trade"
            )}
          </div>

          <PriceBehaviorTradeChart series={series} />

          {selectedTrade ? (
            <div className="bt-os-pb-metrics">
              <div className="bt-os-pb-metric">
                <span>Result</span>
                <strong className={tradePnl(selectedTrade) >= 0 ? "bt-os-td-pos" : "bt-os-td-neg"}>
                  {fmtR(series?.resultR ?? tradeResultR(selectedTrade))}
                </strong>
              </div>
              <div className="bt-os-pb-metric">
                <span>MFE</span>
                <strong>{fmtR(series?.mfeR ?? Number(selectedTrade.mfe_r))}</strong>
              </div>
              <div className="bt-os-pb-metric">
                <span>MAE</span>
                <strong>{fmtR(series?.maeR ?? Number(selectedTrade.mae_r))}</strong>
              </div>
              <div className="bt-os-pb-metric">
                <span>Capture</span>
                <strong>
                  {series?.captureRatio != null ? `${(series.captureRatio * 100).toFixed(0)}%` : "—"}
                </strong>
              </div>
              <div className="bt-os-pb-metric">
                <span>Exit timing gap</span>
                <strong>{fmtR(series?.exitTimingGap)}</strong>
              </div>
              <div className="bt-os-pb-metric">
                <span>Would-have-won</span>
                <strong>{series?.wouldHaveWon ? "Yes" : "No"}</strong>
              </div>
            </div>
          ) : null}

          {selectedTrade ? (
            <div className="bt-os-pb-vars">
              <div>
                <span className="bt-os-pb-vars-label">PRE</span>
                {formatStrategyVars(selectedTrade.strategy_variables)}
              </div>
              <div>
                <span className="bt-os-pb-vars-label">POST</span>
                {formatStrategyVars(selectedTrade.post_strategy_variables)}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="bt-os-section">
        <div className="bt-os-chart-card">
          <div className="bt-os-chart-title">
            MAE vs MFE scatter <span>click a dot to select trade</span>
          </div>
          <PriceBehaviorScatterChart
            points={scatter}
            selectedKey={selectedKey}
            onSelect={onSelect}
          />
        </div>
      </div>
    </div>
  );
}
