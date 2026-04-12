"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { compressCoverImageFile } from '@/strategyLab/coverImage';
import { FOREX_INSTRUMENTS, FUTURES_INSTRUMENTS, normalizeInstrumentId } from '@/strategyLab/instruments';

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
  wrapperClassName = 'mb-5',
}: {
  label: string;
  options: ToggleOpt[];
  value: string;
  onChange: (id: string) => void;
  name?: string;
  wrapperClassName?: string;
}) {
  return (
    <div className={wrapperClassName}>
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

  const fileRef = useRef<HTMLInputElement>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const coverImage = typeof draft.cover_image === 'string' ? draft.cover_image : '';

  const instrumentValue = normalizeInstrumentId(
    draft.instrument != null && draft.instrument !== '' ? String(draft.instrument) : ''
  );

  useEffect(() => {
    setDraft((d) => {
      const raw = d.instrument != null && d.instrument !== '' ? String(d.instrument) : '';
      const n = normalizeInstrumentId(raw);
      if (n === raw) return d;
      return { ...d, instrument: n };
    });
  }, [draft.instrument, setDraft]);

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImgBusy(true);
    try {
      const dataUrl = await compressCoverImageFile(f);
      setDraft((d) => ({ ...d, cover_image: dataUrl }));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not process image');
    } finally {
      setImgBusy(false);
    }
  };

  const clearCover = () => setDraft((d) => ({ ...d, cover_image: '' }));

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

      <div className="mb-6">
        <label className="font-mono-label mb-2 block text-[11px] font-bold uppercase text-[var(--sl-text-sec)]">
          Strategy image <span className="font-normal normal-case text-[var(--sl-text-muted)]">(optional)</span>
        </label>
        <p className="mb-3 text-xs text-[var(--sl-text-muted)]">
          Shown on your community posts. Images are resized and compressed in the browser before saving.
        </p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
        {coverImage ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <img
              src={coverImage}
              alt=""
              className="h-40 max-w-full rounded-xl border border-[var(--sl-border)] object-cover sm:h-36 sm:w-56"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={imgBusy}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-2 text-sm hover:bg-[var(--sl-card)] disabled:opacity-50"
              >
                <ImagePlus size={16} />
                {imgBusy ? 'Processing…' : 'Replace image'}
              </button>
              <button
                type="button"
                onClick={clearCover}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--sl-border)] px-3 py-2 text-sm text-[var(--sl-red)] hover:bg-[var(--sl-red)]/10"
              >
                <Trash2 size={16} />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={imgBusy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[var(--sl-border)] bg-[var(--sl-input)]/60 px-4 py-3 text-sm text-[var(--sl-text-sec)] hover:border-[var(--sl-accent)] hover:text-[var(--sl-text)] disabled:opacity-50"
          >
            <ImagePlus size={18} />
            {imgBusy ? 'Processing…' : 'Upload image'}
          </button>
        )}
      </div>

      <div className="mb-5">
        <div className="font-mono-label mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">
          Instrument
        </div>
        <p className="mb-3 text-xs text-[var(--sl-text-muted)]">
          Forex pairs and futures use the same symbols as the Talaria chart registry.
        </p>
        <ToggleRow
          label="Forex pairs"
          options={FOREX_INSTRUMENTS}
          value={instrumentValue}
          onChange={set('instrument')}
          wrapperClassName="mb-3"
        />
        <ToggleRow label="Futures" options={FUTURES_INSTRUMENTS} value={instrumentValue} onChange={set('instrument')} />
      </div>
      <ToggleRow label="Style" options={STYLES} value={String(draft.style ?? '')} onChange={set('style')} />
      <ToggleRow label="Direction" options={DIRECTIONS} value={String(draft.direction ?? 'both')} onChange={set('direction')} />
      <ToggleRow label="Timeframe" options={TIMEFRAMES} value={String(draft.timeframe ?? '')} onChange={set('timeframe')} />
    </div>
  );
}
