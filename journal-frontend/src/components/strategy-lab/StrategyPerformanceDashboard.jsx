import React from 'react';
import { X, BarChart3, Percent, Target, TrendingUp, TrendingDown } from 'lucide-react';

function fmtPct(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return '—';
  return `${(Number(rate) * 100).toFixed(1)}%`;
}

function fmtNum(n, opts) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const abs = Math.abs(v).toFixed(2);
  if (opts?.signed && v > 0) return `+${abs}`;
  if (opts?.signed && v < 0) return `-${abs}`;
  return v.toFixed(2);
}

function MetricCard({ label, value, sub, icon: Icon, accent }) {
  const ring =
    accent === 'green'
      ? 'border-[var(--sl-green)]/35 bg-[rgba(34,197,94,0.08)]'
      : accent === 'red'
        ? 'border-[var(--sl-red)]/35 bg-[rgba(239,68,68,0.06)]'
        : accent === 'cyan'
          ? 'border-[var(--sl-cyan)]/35 bg-[rgba(6,182,212,0.08)]'
          : accent === 'purple'
            ? 'border-[var(--sl-purple)]/35 bg-[rgba(168,85,247,0.08)]'
            : 'border-[var(--sl-border)] bg-[var(--sl-input)]/60';
  const iconColor =
    accent === 'green'
      ? 'text-[var(--sl-green)]'
      : accent === 'red'
        ? 'text-[var(--sl-red)]'
        : accent === 'cyan'
          ? 'text-[var(--sl-cyan)]'
          : accent === 'purple'
            ? 'text-[var(--sl-purple)]'
            : 'text-[var(--sl-accent-light)]';

  return (
    <div className={`rounded-xl border p-4 ${ring}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-mono-label text-[10px] font-bold uppercase tracking-wide text-[var(--sl-text-muted)]">
          {label}
        </span>
        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} aria-hidden />
      </div>
      <div className="text-2xl font-bold tabular-nums tracking-tight text-[var(--sl-text)]">{value}</div>
      {sub ? <p className="mt-1 text-[11px] text-[var(--sl-text-muted)]">{sub}</p> : null}
    </div>
  );
}

export default function StrategyPerformanceDashboard({ strategyId, performance, onClose }) {
  const p = performance || {};
  const trades = p.total_trades ?? 0;
  const winRate = p.win_rate;
  const pf = p.profit_factor;
  const pnl = p.total_pnl ?? 0;
  const avgWin = p.avg_win;
  const avgLoss = p.avg_loss;

  const pnlPositive = pnl > 0;
  const pnlNegative = pnl < 0;
  const empty = trades === 0;

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-card)] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--sl-border)] bg-[var(--sl-input)]/40 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(38,67,247,0.2)] text-[var(--sl-accent-light)]">
            <BarChart3 className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--sl-text)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Strategy performance
            </h3>
            <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">
              Journal trades linked to this strategy · #{strategyId}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-2 text-sm text-[var(--sl-text)] transition hover:bg-[var(--sl-card)]"
        >
          <X className="h-4 w-4" />
          Close
        </button>
      </div>

      <div className="p-5">
        {empty ? (
          <div className="rounded-xl border border-dashed border-[var(--sl-border)] bg-[var(--sl-bg)]/50 px-6 py-12 text-center">
            <Target className="mx-auto mb-3 h-10 w-10 text-[var(--sl-text-muted)]" aria-hidden />
            <p className="text-sm font-medium text-[var(--sl-text)]">No trades yet</p>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-[var(--sl-text-muted)]">
              Tag trades with this strategy in your journal. When trades exist, win rate, P&amp;L, and profit factor will
              show here.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                label="Total trades"
                value={trades}
                sub="Closed trades matching this strategy"
                icon={BarChart3}
                accent="default"
              />
              <MetricCard
                label="Win rate"
                value={fmtPct(winRate ?? null)}
                sub="Winning trades ÷ total"
                icon={Percent}
                accent="cyan"
              />
              <MetricCard
                label="Total P&amp;L"
                value={
                  <span
                    className={
                      pnlPositive
                        ? 'text-[var(--sl-green)]'
                        : pnlNegative
                          ? 'text-[var(--sl-red)]'
                          : 'text-[var(--sl-text)]'
                    }
                  >
                    {fmtNum(pnl, { signed: true })}
                  </span>
                }
                sub="Sum of P&amp;L on linked trades"
                icon={pnlNegative ? TrendingDown : TrendingUp}
                accent={pnlPositive ? 'green' : pnlNegative ? 'red' : 'default'}
              />
              <MetricCard
                label="Profit factor"
                value={pf != null ? Number(pf).toFixed(2) : '—'}
                sub="Gross profit ÷ gross loss"
                icon={Target}
                accent="purple"
              />
              <MetricCard
                label="Avg win"
                value={fmtNum(avgWin ?? null)}
                sub="Average of winning trades"
                icon={TrendingUp}
                accent="green"
              />
              <MetricCard
                label="Avg loss"
                value={avgLoss != null ? fmtNum(avgLoss) : '—'}
                sub="Average of losing trades (negative)"
                icon={TrendingDown}
                accent="red"
              />
            </div>
            <p className="text-center text-[10px] text-[var(--sl-text-faint)]">
              Same scope as journal analytics: trades where strategy ID or name matches.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
