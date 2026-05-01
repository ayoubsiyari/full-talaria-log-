// @ts-nocheck
"use client";

import React from 'react';
import { Printer } from 'lucide-react';
import { formatInstrumentsLine, formatMarketCategoriesLine } from '@/strategyLab/instruments';
import ConditionReferenceUrlBlock from './ConditionReferenceUrlBlock';

function countConditions(conditions) {
  return (conditions || []).filter((c) => c.type === 'condition').length;
}

function countVariables(variables, timing) {
  return (variables || []).filter((v) => v.type === 'variable' && v.timing === timing).length;
}

export default function ReviewStep({ draft }) {
  const conds = draft.conditions || [];
  const vars = draft.variables || [];

  return (
    <div className="strategy-spec-sheet mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-xl font-bold text-[var(--sl-text)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
          Review
        </h2>
        <button
          type="button"
          data-strategy-lab-hide-print="true"
          onClick={() => window.print()}
          className="strategy-lab-no-print inline-flex items-center gap-2 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-2 text-sm text-[var(--sl-text)] hover:bg-[var(--sl-card)]"
        >
          <Printer size={16} />
          Print spec
        </button>
      </div>
      <div className="spec-card mb-8 rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="font-mono-label text-[10px] font-bold uppercase text-[var(--sl-text-muted)]">Name</div>
            <div className="text-[var(--sl-text)]">{draft.name || '—'}</div>
          </div>
          <div>
            <div className="font-mono-label text-[10px] font-bold uppercase text-[var(--sl-text-muted)]">Markets</div>
            <div className="text-[var(--sl-text)]">{formatMarketCategoriesLine(draft.market_categories) || '—'}</div>
          </div>
          <div>
            <div className="font-mono-label text-[10px] font-bold uppercase text-[var(--sl-text-muted)]">Symbols</div>
            <div className="text-[var(--sl-text)]">{formatInstrumentsLine(draft) || '—'}</div>
          </div>
          <div>
            <div className="font-mono-label text-[10px] font-bold uppercase text-[var(--sl-text-muted)]">Style</div>
            <div className="text-[var(--sl-text)]">{draft.style || '—'}</div>
          </div>
          <div>
            <div className="font-mono-label text-[10px] font-bold uppercase text-[var(--sl-text-muted)]">Direction</div>
            <div className="text-[var(--sl-text)]">{draft.direction || '—'}</div>
          </div>
          <div>
            <div className="font-mono-label text-[10px] font-bold uppercase text-[var(--sl-text-muted)]">Timeframe</div>
            <div className="text-[var(--sl-text)]">{draft.timeframe || '—'}</div>
          </div>
        </div>
        <div className="mt-4 border-t border-[var(--sl-border)] pt-4">
          <div className="font-mono-label mb-1 text-[10px] font-bold uppercase text-[var(--sl-text-muted)]">Description</div>
          <p className="whitespace-pre-wrap text-sm text-[var(--sl-text-sec)]">{draft.description || '—'}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="spec-card rounded-xl border border-[var(--sl-border)] bg-[rgba(20,20,32,0.6)] p-4">
          <h3 className="mb-3 font-mono-label text-[12px] font-bold uppercase text-[var(--sl-accent-light)]">
            Conditions ({countConditions(conds)})
          </h3>
          <ul className="space-y-3">
            {conds.map((c) => {
              if (c.type === 'category') {
                return (
                  <li key={c.id} className="font-mono-label text-[11px] font-bold uppercase" style={{ color: c.color }}>
                    {c.label}
                  </li>
                );
              }
              if (c.type === 'condition') {
                return (
                  <li key={c.id} className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] p-3 text-sm">
                    <div className="font-semibold text-[var(--sl-text)]">{c.name}</div>
                    {c.note ? <div className="mt-1 text-[11px] italic text-[var(--sl-text-muted)]">{c.note}</div> : null}
                    <div className="mt-1 text-[10px] text-[var(--sl-text-faint)]">{c.ctype}</div>
                    <ConditionReferenceUrlBlock value={c.reference_url ?? c.referenceUrl} readOnly compact />
                  </li>
                );
              }
              return null;
            })}
          </ul>
        </div>
        <div className="spec-card rounded-xl border border-[var(--sl-border)] bg-[rgba(20,20,32,0.6)] p-4">
          <h3 className="mb-3 font-mono-label text-[12px] font-bold uppercase text-[var(--sl-green)]">
            Variables — Pre ({countVariables(vars, 'pre')})
          </h3>
          <ul className="mb-6 space-y-2">
            {vars
              .filter((v) => v.type === 'variable' && v.timing === 'pre')
              .map((v) => (
                <li key={v.id} className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] p-2 text-sm">
                  <span className="font-mono-label mr-2 text-[9px] text-[var(--sl-green)]">PRE</span>
                  {v.name}
                </li>
              ))}
          </ul>
          <h3 className="mb-3 font-mono-label text-[12px] font-bold uppercase text-[var(--sl-purple)]">
            Variables — Post ({countVariables(vars, 'post')})
          </h3>
          <ul className="space-y-2">
            {vars
              .filter((v) => v.type === 'variable' && v.timing === 'post')
              .map((v) => (
                <li key={v.id} className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] p-2 text-sm">
                  <span className="font-mono-label mr-2 text-[9px] text-[var(--sl-purple)]">POST</span>
                  {v.name}
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
