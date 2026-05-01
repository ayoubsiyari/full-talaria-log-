import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ImagePlus, Trash2 } from 'lucide-react';
import { compressCoverImageFile } from '../../strategyLab/coverImage';
import {
  FOREX_INSTRUMENTS,
  COMMODITY_CFD_INSTRUMENTS,
  FUTURES_INSTRUMENTS,
  CRYPTO_INSTRUMENTS,
  MARKET_CATEGORY_OPTIONS,
  normalizeInstrumentId,
  normalizeInstrumentList,
  normalizeMarketCategories,
  formatInstrumentLabel,
} from '../../strategyLab/instruments';

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

function ToggleRow({ label, options, value, onChange, name, wrapperClassName = 'mb-5' }) {
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

function MarketCategoriesRow({ selectedIds, onToggle }) {
  const selected = new Set(selectedIds || []);
  return (
    <div className="flex flex-wrap gap-2">
      {MARKET_CATEGORY_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onToggle(opt.id)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
            selected.has(opt.id)
              ? 'border-[var(--sl-accent)] bg-[rgba(38,67,247,0.2)] text-[var(--sl-accent-light)] shadow-[0_0_12px_rgba(38,67,247,0.25)]'
              : 'border-[var(--sl-border)] bg-[var(--sl-input)] text-[var(--sl-text)] hover:border-[var(--sl-text-muted)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function InstrumentMultiSelect({ selectedIds, onToggle, marketCategories }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = new Set(selectedIds || []);
  const cats = normalizeMarketCategories(marketCategories);
  const showAll = cats.length === 0;
  const showForex = showAll || cats.includes('forex');
  const showFutures = showAll || cats.includes('futures');
  const showCrypto = showAll || cats.includes('crypto');

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const labels = selectedIds.map((id) => formatInstrumentLabel(id)).filter(Boolean);
  let summary = 'Select instruments…';
  if (labels.length === 1) summary = labels[0];
  else if (labels.length === 2) summary = `${labels[0]}, ${labels[1]}`;
  else if (labels.length > 2) summary = `${labels[0]}, ${labels[1]} +${labels.length - 2} more`;

  const Section = ({ title, options }) => (
    <div className="border-b border-[var(--sl-border)] last:border-b-0">
      <div className="sticky top-0 z-[1] bg-[var(--sl-card)] px-3 py-2 font-mono-label text-[10px] font-bold uppercase tracking-wide text-[var(--sl-text-muted)]">
        {title}
      </div>
      <ul className="max-h-40 overflow-y-auto px-2 py-1">
        {options.map((opt) => (
          <li key={opt.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--sl-text)] hover:bg-[var(--sl-input)]">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-[var(--sl-border)] bg-[var(--sl-input)] text-[var(--sl-accent)] focus:ring-[var(--sl-accent)]"
                checked={selected.has(opt.id)}
                onChange={() => onToggle(opt.id)}
              />
              <span>{opt.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-2.5 text-left text-sm text-[var(--sl-text)] hover:border-[var(--sl-text-muted)] focus:border-[var(--sl-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--sl-accent)] focus:ring-offset-2 focus:ring-offset-[var(--sl-sidebar)]"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={`min-w-0 flex-1 truncate ${labels.length ? '' : 'text-[var(--sl-text-muted)]'}`}>{summary}</span>
        <ChevronDown size={18} className={`shrink-0 text-[var(--sl-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[min(70vh,420px)] overflow-hidden rounded-lg border border-[var(--sl-border)] bg-[var(--sl-card)] shadow-lg ring-1 ring-black/20"
          role="listbox"
        >
          <div className="max-h-[min(70vh,420px)] overflow-y-auto">
            {showForex ? (
              <>
                <Section title="Forex pairs" options={FOREX_INSTRUMENTS} />
                <Section title="Commodities (CFD)" options={COMMODITY_CFD_INSTRUMENTS} />
              </>
            ) : null}
            {showFutures ? <Section title="Futures" options={FUTURES_INSTRUMENTS} /> : null}
            {showCrypto ? <Section title="Crypto" options={CRYPTO_INSTRUMENTS} /> : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GeneralInfoStep({ draft, setDraft }) {
  const set = (key) => (v) => setDraft((d) => ({ ...d, [key]: v }));
  const fileRef = useRef(null);
  const [imgBusy, setImgBusy] = useState(false);

  const coverImage = typeof draft.cover_image === 'string' ? draft.cover_image : '';

  const onPickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImgBusy(true);
    try {
      const dataUrl = await compressCoverImageFile(f);
      setDraft((d) => ({ ...d, cover_image: dataUrl }));
    } catch (err) {
      alert(err?.message || 'Could not process image');
    } finally {
      setImgBusy(false);
    }
  };

  const clearCover = () => setDraft((d) => ({ ...d, cover_image: '' }));

  const selectedInstrumentIds = normalizeInstrumentList(draft.instruments, draft.instrument);
  const selectedMarketCategories = normalizeMarketCategories(draft.market_categories);

  const toggleMarketCategory = (rawId) => {
    const id = String(rawId).toLowerCase();
    if (!['forex', 'futures', 'crypto'].includes(id)) return;
    setDraft((d) => {
      const cur = normalizeMarketCategories(d.market_categories);
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { ...d, market_categories: next };
    });
  };

  const toggleInstrument = (rawId) => {
    const id = normalizeInstrumentId(rawId);
    if (!id) return;
    setDraft((d) => {
      let next = normalizeInstrumentList(d.instruments, d.instrument);
      if (next.includes(id)) {
        next = next.filter((x) => x !== id);
      } else {
        next = [...next, id];
      }
      return { ...d, instruments: next, instrument: undefined };
    });
  };

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
          value={draft.name}
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
          value={draft.description}
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
          Markets
        </div>
        <p className="mb-2 text-xs text-[var(--sl-text-muted)]">
          General focus: Forex, Futures, and/or Crypto. Selected markets limit which symbol groups appear below; leave all
          off to show every group.
        </p>
        <MarketCategoriesRow selectedIds={selectedMarketCategories} onToggle={toggleMarketCategory} />
        <div className="font-mono-label mb-2 mt-5 text-[11px] font-bold uppercase tracking-wide text-[var(--sl-text-sec)]">
          Symbols
        </div>
        <p className="mb-3 text-xs text-[var(--sl-text-muted)]">
          Specific instruments from the chart registry — multi-select in the menu.
        </p>
        <InstrumentMultiSelect
          selectedIds={selectedInstrumentIds}
          onToggle={toggleInstrument}
          marketCategories={selectedMarketCategories}
        />
      </div>
      <ToggleRow label="Style" options={STYLES} value={draft.style} onChange={set('style')} />
      <ToggleRow label="Direction" options={DIRECTIONS} value={draft.direction} onChange={set('direction')} />
      <ToggleRow label="Timeframe" options={TIMEFRAMES} value={draft.timeframe} onChange={set('timeframe')} />
    </div>
  );
}
