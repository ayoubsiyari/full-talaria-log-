"use client";

import React from 'react';

const INSTRUMENTS = [
  { id: 'es', label: 'ES Futures' },
  { id: 'nq', label: 'NQ Futures' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'forex', label: 'Forex' },
];

const STYLES = [
  { id: 'scalping', label: 'Scalping' },
  { id: 'intraday', label: 'Intraday' },
  { id: 'swing', label: 'Swing' },
];

const DIRECTIONS = [
  { id: 'both', label: 'Both' },
  { id: 'long', label: 'Long Only' },
  { id: 'short', label: 'Short Only' },
];

const TIMEFRAMES = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1h' },
  { id: '4h', label: '4h' },
  { id: 'daily', label: 'Daily' },
];

type ToggleOpt = { id: string; label: string };

function ToggleRow({
  label,
  options,
  value,
  onChange,
  name,
}: {
  label: string;
  options: ToggleOpt[];
  value: string;
  onChange: (id: string) => void;
  name?: string;
}) {
  return (
    <div className="mb-5">
      <div className="font-mono-label mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            name={name}
            onClick={() => onChange(opt.id)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
              value === opt.id
                ? 'border-[var(--sl-accent)] bg-[rgba(38,67,247,0.2)] text-[var(--sl-accent-light)] shadow-[0_0_12px_rgba(38,67,247,0.25)]'
                : 'border-[var(--sl-border)] bg-[var(--sl-input)] text-[var(--sl-text)] hover:border-[var(--sl-text-muted)]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function GeneralInfoStep({
  draft,
  setDraft,
}: {
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const set =
    (key: string) =>
    (v: string) =>
      setDraft((d) => ({ ...d, [key]: v }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h2 className="mb-6 text-xl font-bold text-[var(--sl-text)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
        General Info
      </h2>
      <div className="mb-4">
        <label className="font-mono-label mb-1 block text-[11px] font-bold uppercase text-[var(--sl-text-sec)]">
          Strategy name <span className="text-[var(--sl-red)]">*</span>
        </label>
        <input
          type="text"
          value={String(draft.name ?? '')}
          onChange={(e) => set('name')(e.target.value)}
          placeholder="e.g. BB Squeeze Fade"
          className="w-full rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-2.5 text-[var(--sl-text)] placeholder:text-[var(--sl-text-faint)] focus:border-[var(--sl-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--sl-accent)]"
        />
      </div>
      <div className="mb-6">
        <label className="font-mono-label mb-1 block text-[11px] font-bold uppercase text-[var(--sl-text-sec)]">
          Description
        </label>
        <textarea
          value={String(draft.description ?? '')}
          onChange={(e) => set('description')(e.target.value)}
          placeholder="Core thesis, when it works, what to watch for…"
          rows={5}
          className="min-h-[120px] w-full resize-y rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-2.5 text-[var(--sl-text)] placeholder:text-[var(--sl-text-faint)] focus:border-[var(--sl-accent)] focus:outline-none"
        />
      </div>
      <ToggleRow label="Instrument" options={INSTRUMENTS} value={String(draft.instrument ?? '')} onChange={set('instrument')} />
      <ToggleRow label="Style" options={STYLES} value={String(draft.style ?? '')} onChange={set('style')} />
      <ToggleRow label="Direction" options={DIRECTIONS} value={String(draft.direction ?? 'both')} onChange={set('direction')} />
      <ToggleRow label="Timeframe" options={TIMEFRAMES} value={String(draft.timeframe ?? '')} onChange={set('timeframe')} />
    </div>
  );
}
