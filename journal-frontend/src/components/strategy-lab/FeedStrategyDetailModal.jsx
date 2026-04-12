import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { API_BASE_URL } from '../../config';
import { formatInstrumentLabel } from '../../strategyLab/instruments';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

function currentUserId() {
  try {
    const u = JSON.parse(localStorage.getItem('talaria_current_user') || '{}');
    return u.id ?? u.user_id ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {{ post: object, onClose: () => void }} props
 */
export default function FeedStrategyDetailModal({ post, onClose }) {
  const [perf, setPerf] = useState(null);
  const [perfErr, setPerfErr] = useState(null);
  const [loadingPerf, setLoadingPerf] = useState(false);

  const strategy = post?.strategy;
  const sid = strategy?.id;
  const authorId = post?.author?.id;
  const uid = currentUserId();
  const isOwner = uid != null && authorId != null && Number(uid) === Number(authorId);

  const def = strategy?.strategy_definition || {};
  const conditions = Array.isArray(def.conditions) ? def.conditions : [];
  const variables = Array.isArray(def.variables) ? def.variables : [];

  useEffect(() => {
    if (!sid || !isOwner) {
      setPerf(null);
      setPerfErr(null);
      return;
    }
    let cancelled = false;
    setLoadingPerf(true);
    setPerfErr(null);
    fetch(`${API_BASE_URL}/strategies/${sid}/performance`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) setPerf(data.performance);
        else setPerfErr(data.error || 'Could not load analytics');
      })
      .catch(() => {
        if (!cancelled) setPerfErr('Could not load analytics');
      })
      .finally(() => {
        if (!cancelled) setLoadingPerf(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sid, isOwner]);

  if (!post || !strategy) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-6 shadow-xl"
        style={{ fontFamily: 'Outfit, sans-serif' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--sl-text)]">{strategy.name || 'Strategy'}</h2>
            <p className="mt-1 text-sm text-[var(--sl-text-muted)]">
              Shared by {post.author?.name || 'Trader'}
              {post.created_at ? ` · ${new Date(post.created_at).toLocaleString()}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--sl-text-muted)] hover:bg-[var(--sl-input)]"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        {post.caption ? (
          <p className="mb-4 whitespace-pre-wrap text-sm text-[var(--sl-text-sec)]">{post.caption}</p>
        ) : null}

        {post.include_description !== false && strategy.description ? (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">Description</h3>
            <p className="text-sm leading-relaxed text-[var(--sl-text)]">{strategy.description}</p>
          </section>
        ) : null}

        <section className="mb-4 flex flex-wrap gap-2 text-xs text-[var(--sl-text-sec)]">
          {def.instrument ? (
            <span className="rounded-md bg-[var(--sl-input)] px-2 py-1">{formatInstrumentLabel(def.instrument)}</span>
          ) : null}
          {def.style ? <span className="rounded-md bg-[var(--sl-input)] px-2 py-1">{def.style}</span> : null}
          {def.timeframe ? <span className="rounded-md bg-[var(--sl-input)] px-2 py-1">{def.timeframe}</span> : null}
          {def.direction ? <span className="rounded-md bg-[var(--sl-input)] px-2 py-1">{def.direction}</span> : null}
        </section>

        {post.include_conditions !== false && conditions.length > 0 ? (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">Conditions</h3>
            <ul className="space-y-1 text-sm text-[var(--sl-text)]">
              {conditions
                .filter((c) => c && c.type === 'condition')
                .map((c) => (
                  <li key={c.id || c.name} className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)]/40 px-3 py-2">
                    {c.name || '—'}
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        {post.include_variables !== false && variables.length > 0 ? (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">Variables</h3>
            <ul className="space-y-1 text-sm text-[var(--sl-text)]">
              {variables.map((v) => (
                <li key={v.id || v.name} className="rounded-lg border border-[var(--sl-border)] px-3 py-2">
                  <span className="font-medium">{v.name || '—'}</span>
                  {v.category ? (
                    <span className="ml-2 text-[var(--sl-text-muted)]">({v.category})</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg)] p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">
            Journal analytics
          </h3>
          {!isOwner ? (
            <p className="text-sm text-[var(--sl-text-muted)]">
              Performance stats are tied to the author&apos;s private journal. If this is your strategy, you&apos;ll see
              analytics here when you open your own post.
            </p>
          ) : loadingPerf ? (
            <p className="text-sm text-[var(--sl-text-muted)]">Loading…</p>
          ) : perfErr ? (
            <p className="text-sm text-[var(--sl-red)]">{perfErr}</p>
          ) : perf ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ['Total trades', perf.total_trades ?? '—'],
                ['Win rate', perf.win_rate != null ? `${(Number(perf.win_rate) * 100).toFixed(1)}%` : '—'],
                ['Profit factor', perf.profit_factor ?? '—'],
                ['Total P&L', perf.total_pnl ?? '—'],
                ['Avg win', perf.avg_win ?? '—'],
                ['Avg loss', perf.avg_loss ?? '—'],
              ].map(([label, val]) => (
                <div key={label} className="rounded-lg bg-[var(--sl-card)] px-3 py-2">
                  <div className="text-[10px] uppercase text-[var(--sl-text-muted)]">{label}</div>
                  <div className="mt-0.5 font-semibold text-[var(--sl-text)]">{val}</div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
