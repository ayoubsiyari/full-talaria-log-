"use client";

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { JOURNAL_API_BASE } from '@/lib/journalApi';

export default function ShareStrategyModal({
  strategyId,
  onClose,
  onPosted,
}: {
  strategyId: number;
  onClose: () => void;
  onPosted?: () => void;
}) {
  const [caption, setCaption] = useState('');
  const [include_description, setIncludeDescription] = useState(true);
  const [include_conditions, setIncludeConditions] = useState(true);
  const [include_variables, setIncludeVariables] = useState(true);
  const [include_stats, setIncludeStats] = useState(false);
  const [include_heatmap, setIncludeHeatmap] = useState(false);
  const [include_trades, setIncludeTrades] = useState(false);
  const [visibility, setVisibility] = useState('public');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setErr(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${JOURNAL_API_BASE}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          strategy_id: strategyId,
          caption,
          include_description,
          include_conditions,
          include_variables,
          include_stats,
          include_heatmap,
          include_trades,
          visibility,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed');
      onPosted?.();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-6 shadow-xl"
        style={{ fontFamily: 'Outfit, sans-serif' }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--sl-text)]">Share strategy</h2>
          <button type="button" onClick={onClose} className="rounded p-1 text-[var(--sl-text-muted)] hover:bg-[var(--sl-input)]">
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-sm text-[var(--sl-text-sec)]">Choose what to include in the community feed post.</p>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Caption (optional)"
          rows={3}
          className="mb-4 w-full rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-2 text-[var(--sl-text)]"
        />
        <div className="mb-4 space-y-2 text-sm text-[var(--sl-text)]">
          {(
            [
              ['Description', include_description, setIncludeDescription],
              ['Conditions', include_conditions, setIncludeConditions],
              ['Variables', include_variables, setIncludeVariables],
              ['Summary stats', include_stats, setIncludeStats],
              ['Heatmap', include_heatmap, setIncludeHeatmap],
              ['Trade log', include_trades, setIncludeTrades],
            ] as [string, boolean, React.Dispatch<React.SetStateAction<boolean>>][]
          ).map(([label, val, setVal]) => (
            <label key={label} className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={val} onChange={(e) => setVal(e.target.checked)} className="rounded border-[var(--sl-border)]" />
              {label}
            </label>
          ))}
        </div>
        <div className="mb-4">
          <span className="mb-1 block text-xs text-[var(--sl-text-muted)]">Visibility</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="w-full rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-2 text-[var(--sl-text)]"
          >
            <option value="public">Public — everyone signed in</option>
            <option value="friends">Friends — mutual follows only</option>
            <option value="private">Private — only you (hidden from others&apos; feeds)</option>
          </select>
          <p className="mt-2 text-xs text-[var(--sl-text-muted)]">
            Friends: both users must follow each other. Private posts only you see in the feed.
          </p>
        </div>
        {err && <p className="mb-2 text-sm text-[var(--sl-red)]">{err}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[var(--sl-border)] px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={submit}
            className="rounded-lg bg-[var(--sl-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
