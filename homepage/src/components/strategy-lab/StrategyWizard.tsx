"use client";

import React from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import GeneralInfoStep from './GeneralInfoStep';
import StrategyFlowStep from './StrategyFlowStep';
import ReviewStep from './ReviewStep';

const STEPS = [
  { id: 1, title: 'General Info' },
  { id: 2, title: 'Strategy Flow' },
  { id: 3, title: 'Review' },
];

export default function StrategyWizard({
  draft,
  setDraft,
  step,
  setStep,
  onSubmit,
  onBack,
  saving,
  isEdit,
}: {
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  step: number;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  onSubmit: () => void | Promise<void>;
  onBack: () => void;
  saving: boolean;
  isEdit?: boolean;
}) {
  const canNext = () => {
    if (step === 1) return String(draft.name ?? '').trim().length > 0;
    return true;
  };

  const goNext = () => {
    if (!canNext()) return;
    setStep((s) => Math.min(3, s + 1));
  };

  const goPrev = () => {
    setStep((s) => Math.max(1, s - 1));
  };

  return (
    <div className="flex min-h-[calc(100vh-120px)] flex-col pb-24">
      {/* Stepper */}
      <div className="sticky top-0 z-10 border-b border-[var(--sl-border)] bg-[var(--sl-sidebar)] px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
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
      </div>

      <div className="flex-1 overflow-auto">
        {step === 1 && <GeneralInfoStep draft={draft} setDraft={setDraft} />}
        {step === 2 && <StrategyFlowStep draft={draft} setDraft={setDraft} />}
        {step === 3 && <ReviewStep draft={draft} />}
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--sl-border)] bg-[var(--sl-sidebar)] px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={step === 1 ? onBack : goPrev}
            className="flex items-center gap-1 rounded-lg border border-[var(--sl-border)] px-4 py-2 text-sm text-[var(--sl-text)] hover:bg-[var(--sl-input)]"
          >
            <ChevronLeft size={18} /> Back
          </button>
          <div className="flex gap-1">
            {[1, 2, 3].map((d) => (
              <span
                key={d}
                className={`h-2 w-2 rounded-full ${step === d ? 'bg-[var(--sl-accent)]' : 'bg-[var(--sl-border)]'}`}
              />
            ))}
          </div>
          {step < 3 ? (
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
              disabled={saving || !String(draft.name ?? '').trim()}
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
