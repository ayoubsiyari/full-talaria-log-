"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { JOURNAL_API_BASE } from "@/lib/journalApi";
import { formatInstrumentLabel } from "@/strategyLab/instruments";

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string>;
}

function currentUserId(): number | null {
  try {
    const u = JSON.parse(typeof window !== "undefined" ? localStorage.getItem("talaria_current_user") || "{}" : "{}");
    const id = u.id ?? u.user_id;
    return id != null ? Number(id) : null;
  } catch {
    return null;
  }
}

export default function FeedStrategyDetailModal({
  post,
  onClose,
}: {
  post: Record<string, unknown> | null;
  onClose: () => void;
}) {
  const [perf, setPerf] = useState<Record<string, unknown> | null>(null);
  const [perfErr, setPerfErr] = useState<string | null>(null);
  const [loadingPerf, setLoadingPerf] = useState(false);

  const strategy = post?.strategy as Record<string, unknown> | undefined;
  const sid = strategy?.id as number | undefined;
  const author = post?.author as { id?: number } | undefined;
  const authorId = author?.id;
  const uid = currentUserId();
  const isOwner = uid != null && authorId != null && uid === Number(authorId);

  const def = (strategy?.strategy_definition as Record<string, unknown>) || {};
  const conditions = Array.isArray(def.conditions) ? (def.conditions as { type?: string; id?: string; name?: string }[]) : [];
  const variables = Array.isArray(def.variables) ? (def.variables as { id?: string; name?: string; category?: string }[]) : [];

  useEffect(() => {
    if (!sid || !isOwner) {
      setPerf(null);
      setPerfErr(null);
      return;
    }
    let cancelled = false;
    setLoadingPerf(true);
    setPerfErr(null);
    fetch(`${JOURNAL_API_BASE}/strategies/${sid}/performance`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((data: { success?: boolean; performance?: Record<string, unknown>; error?: string }) => {
        if (cancelled) return;
        if (data.success && data.performance) setPerf(data.performance);
        else setPerfErr(data.error || "Could not load analytics");
      })
      .catch(() => {
        if (!cancelled) setPerfErr("Could not load analytics");
      })
      .finally(() => {
        if (!cancelled) setLoadingPerf(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sid, isOwner]);

  if (!post || !strategy) return null;

  const includeDescription = post.include_description !== false;
  const includeConditions = post.include_conditions !== false;
  const includeVariables = post.include_variables !== false;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-6 shadow-xl"
        style={{ fontFamily: "Outfit, sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--sl-text)]">{String(strategy.name || "Strategy")}</h2>
            <p className="mt-1 text-sm text-[var(--sl-text-muted)]">
              Shared by {(post.author as { name?: string } | undefined)?.name || "Trader"}
              {post.created_at ? ` · ${new Date(String(post.created_at)).toLocaleString()}` : ""}
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
          <p className="mb-4 whitespace-pre-wrap text-sm text-[var(--sl-text-sec)]">{String(post.caption)}</p>
        ) : null}

        {includeDescription && strategy.description ? (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">Description</h3>
            <p className="text-sm leading-relaxed text-[var(--sl-text)]">{String(strategy.description)}</p>
          </section>
        ) : null}

        <section className="mb-4 flex flex-wrap gap-2 text-xs text-[var(--sl-text-sec)]">
          {def.instrument ? (
            <span className="rounded-md bg-[var(--sl-input)] px-2 py-1">{formatInstrumentLabel(def.instrument)}</span>
          ) : null}
          {def.style ? <span className="rounded-md bg-[var(--sl-input)] px-2 py-1">{String(def.style)}</span> : null}
          {def.timeframe ? <span className="rounded-md bg-[var(--sl-input)] px-2 py-1">{String(def.timeframe)}</span> : null}
          {def.direction ? <span className="rounded-md bg-[var(--sl-input)] px-2 py-1">{String(def.direction)}</span> : null}
        </section>

        {includeConditions && conditions.length > 0 ? (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">Conditions</h3>
            <ul className="space-y-1 text-sm text-[var(--sl-text)]">
              {conditions
                .filter((c) => c && c.type === "condition")
                .map((c) => (
                  <li key={c.id || c.name} className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)]/40 px-3 py-2">
                    {c.name || "—"}
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        {includeVariables && variables.length > 0 ? (
          <section className="mb-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">Variables</h3>
            <ul className="space-y-1 text-sm text-[var(--sl-text)]">
              {variables.map((v) => (
                <li key={v.id || v.name} className="rounded-lg border border-[var(--sl-border)] px-3 py-2">
                  <span className="font-medium">{v.name || "—"}</span>
                  {v.category ? <span className="ml-2 text-[var(--sl-text-muted)]">({v.category})</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg)] p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">Journal analytics</h3>
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
              {(
                [
                  ["Total trades", perf.total_trades ?? "—"],
                  [
                    "Win rate",
                    perf.win_rate != null ? `${(Number(perf.win_rate) * 100).toFixed(1)}%` : "—",
                  ],
                  ["Profit factor", perf.profit_factor ?? "—"],
                  ["Total P&L", perf.total_pnl ?? "—"],
                  ["Avg win", perf.avg_win ?? "—"],
                  ["Avg loss", perf.avg_loss ?? "—"],
                ] as [string, string | number][]
              ).map(([label, val]) => (
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
