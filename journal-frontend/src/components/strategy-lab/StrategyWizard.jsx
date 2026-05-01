import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import GeneralInfoStep from './GeneralInfoStep';
import StrategyFlowStep from './StrategyFlowStep';
import VariablesStep from './VariablesStep';
import ReviewStep from './ReviewStep';
import { computeBuilderCompletion } from '../../strategyLab/builderCompletion';

const STEPS = [
  { id: 1, title: 'General Info' },
  { id: 2, title: 'Strategy Flow' },
  { id: 3, title: 'Variables' },
  { id: 4, title: 'Review' },
];

const STEP_HINTS = {
  1: 'Name your strategy and narrow markets or symbols so conditions stay relevant.',
  2: 'Group checks into categories. Each path should read like a clear decision tree.',
  3: 'Optional tags for analytics: pre-trade context vs post-trade review.',
  4: 'Confirm the spec, then save. Use print for a clean checklist offline.',
};

function formatClock(t) {
  if (!t) return '';
  try {
    return t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function StrategyWizard({
  draft,
  setDraft,
  step,
  setStep,
  onSubmit,
  onBack,
  saving,
  isEdit,
  autosaveKey = 'new',
}) {
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const debounceRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const completion = useMemo(() => computeBuilderCompletion(draft), [draft]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLastSavedAt(new Date());
      try {
        const payload = {
          at: Date.now(),
          draft: draftRef.current,
        };
        sessionStorage.setItem(`talaria_strategy_lab_autosave_${autosaveKey}`, JSON.stringify(payload));
      } catch {
        /* quota / private mode */
      }
    }, 1200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [draft, autosaveKey]);

  const canNext = () => {
    if (step === 1) return (draft.name || '').trim().length > 0;
    return true;
  };

  const goNext = () => {
    if (!canNext()) return;
    setStep((s) => Math.min(4, s + 1));
  };

  const goPrev = () => {
    setStep((s) => Math.max(1, s - 1));
  };

  const hint = STEP_HINTS[step] || '';

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col pb-24">
      {/* Stepper */}
      <div className="sticky top-0 z-10 border-b border-[var(--sl-border)] bg-[var(--sl-sidebar)] px-4 py-4">
        <div className="mx-auto flex max-w-5xl flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--sl-text-muted)]">
            <span className="font-mono-label">
              Sections{' '}
              <span className="text-[var(--sl-text-sec)]">
                {completion.completedCount}/{completion.total}
              </span>
            </span>
            <span className="hidden sm:inline">
              {completion.variablesDone ? (
                <span className="text-[var(--sl-green)]">Variables added</span>
              ) : (
                <span>Variables optional — add tags for richer analytics</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1 sm:gap-2">
            {STEPS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                  step === s.id
                    ? 'bg-[rgba(38,67,247,0.25)] text-[var(--sl-accent-light)]'
                    : step > s.id
                      ? 'text-[var(--sl-green)]'
                      : 'text-[var(--sl-text-muted)]'
                }`}
              >
                {step > s.id ? <Check size={16} className="shrink-0" /> : <span className="font-mono-label text-xs">{s.id}</span>}
                <span className="hidden sm:inline">{s.title}</span>
              </button>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-[var(--sl-text-sec)]">{hint}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {step === 1 && <GeneralInfoStep draft={draft} setDraft={setDraft} />}
        {step === 2 && <StrategyFlowStep draft={draft} setDraft={setDraft} />}
        {step === 3 && <VariablesStep draft={draft} setDraft={setDraft} />}
        {step === 4 && <ReviewStep draft={draft} />}
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--sl-border)] bg-[var(--sl-sidebar)] px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={step === 1 ? onBack : goPrev}
            className="flex items-center gap-1 rounded-lg border border-[var(--sl-border)] px-4 py-2 text-sm text-[var(--sl-text)] hover:bg-[var(--sl-input)]"
          >
            <ChevronLeft size={18} /> Back
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((d) => (
                <span
                  key={d}
                  className={`h-2 w-2 rounded-full ${step === d ? 'bg-[var(--sl-accent)]' : 'bg-[var(--sl-border)]'}`}
                />
              ))}
            </div>
            {lastSavedAt ? (
              <span className="font-mono-label text-[10px] text-[var(--sl-text-muted)]">Local draft · {formatClock(lastSavedAt)}</span>
            ) : (
              <span className="font-mono-label text-[10px] text-[var(--sl-text-faint)]">Typing saves locally…</span>
            )}
          </div>
          {step < 4 ? (
            <button
              type="button"
              disabled={step === 1 && !canNext()}
              onClick={goNext}
              className="flex items-center gap-1 rounded-lg bg-[var(--sl-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Next <ChevronRight size={18} />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || !(draft.name || '').trim()}
              onClick={onSubmit}
              className="rounded-lg bg-[var(--sl-green)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving ? 'Saving…' : isEdit ? 'Save strategy ✓' : 'Create Strategy ✓'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
