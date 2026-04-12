import React, { useMemo } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash2, Diamond } from 'lucide-react';
import { newId } from '../../strategyLab/ids';
import { SL_COLORS, PRE_VAR_COLORS, POST_VAR_COLORS } from '../../strategyLab/defaults';

function SortableRow({ id, children, className }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      <div className="flex gap-2">
        <button
          type="button"
          className="mt-1 cursor-grab touch-none text-[var(--sl-text-faint)] hover:text-[var(--sl-text-sec)]"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function TypeBadge({ type }) {
  const isMulti = type === 'multi' || type === 'multi_var';
  return (
    <span
      className={`font-mono-label inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
        isMulti ? 'bg-[rgba(38,67,247,0.25)] text-[var(--sl-accent-light)]' : 'bg-[rgba(34,197,94,0.2)] text-[var(--sl-green)]'
      }`}
    >
      {isMulti ? 'multi' : 'yes / no'}
    </span>
  );
}

export default function StrategyFlowStep({ draft, setDraft }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const conditionIds = useMemo(() => draft.conditions.map((c) => c.id), [draft.conditions]);
  const variableIds = useMemo(() => draft.variables.map((v) => v.id), [draft.variables]);

  const onCondDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const oldIndex = d.conditions.findIndex((x) => x.id === active.id);
      const newIndex = d.conditions.findIndex((x) => x.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return d;
      return { ...d, conditions: arrayMove(d.conditions, oldIndex, newIndex) };
    });
  };

  const onVarDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const oldIndex = d.variables.findIndex((x) => x.id === active.id);
      const newIndex = d.variables.findIndex((x) => x.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return d;
      return { ...d, variables: arrayMove(d.variables, oldIndex, newIndex) };
    });
  };

  const addCondition = () => {
    setDraft((d) => {
      let conds = [...d.conditions];
      let catId = conds.find((c) => c.type === 'category')?.id;
      if (!catId) {
        catId = newId('cat');
        conds.unshift({
          type: 'category',
          id: catId,
          label: 'ORDER FLOW',
          ...SL_COLORS.orderFlow,
        });
      }
      conds.push({
        type: 'condition',
        id: newId('cond'),
        catId,
        name: 'New condition',
        note: '',
        ctype: 'yesno',
        options: [],
      });
      return { ...d, conditions: conds };
    });
  };

  const addConditionCategory = () => {
    const id = newId('cat');
    setDraft((d) => ({
      ...d,
      conditions: [
        ...d.conditions,
        {
          type: 'category',
          id,
          label: 'NEW CATEGORY',
          ...SL_COLORS.context,
        },
      ],
    }));
  };

  const addVariable = (timing) => {
    setDraft((d) => {
      let vars = [...d.variables];
      let di = vars.findIndex((x) => x.type === 'divider');
      if (di < 0) {
        vars.push({ type: 'divider', id: newId('div') });
        di = vars.length - 1;
      }
      const slice = timing === 'pre' ? vars.slice(0, di) : vars.slice(di + 1);
      let catId = slice.filter((x) => x.type === 'category')[0]?.id;
      if (!catId) {
        catId = newId('vcat');
        const colors = timing === 'pre' ? PRE_VAR_COLORS.market : POST_VAR_COLORS.execution;
        const cat = {
          type: 'category',
          id: catId,
          label: timing === 'pre' ? 'MARKET' : 'EXECUTION',
          ...colors,
        };
        if (timing === 'pre') {
          vars.splice(di, 0, cat);
          di += 1;
        } else {
          vars.push(cat);
        }
      }
      const node = {
        type: 'variable',
        id: newId('var'),
        catId,
        name: 'New variable',
        note: '',
        vtype: 'yesno',
        options: [],
        timing,
      };
      if (timing === 'pre') {
        vars.splice(di, 0, node);
      } else {
        vars.push(node);
      }
      return { ...d, variables: vars };
    });
  };

  const addVariableCategory = (timing) => {
    setDraft((d) => {
      let vars = [...d.variables];
      let di = vars.findIndex((x) => x.type === 'divider');
      if (di < 0) {
        vars.push({ type: 'divider', id: newId('div') });
        di = vars.length - 1;
      }
      const id = newId('vcat');
      const colors = timing === 'pre' ? PRE_VAR_COLORS.timing : POST_VAR_COLORS.psychology;
      const cat = {
        type: 'category',
        id,
        label: timing === 'pre' ? 'TIMING' : 'PSYCHOLOGY',
        ...colors,
      };
      if (timing === 'pre') {
        vars.splice(di, 0, cat);
      } else {
        vars.push(cat);
      }
      return { ...d, variables: vars };
    });
  };

  const ensureDivider = () => {
    setDraft((d) => {
      if (d.variables.some((x) => x.type === 'divider')) return d;
      return { ...d, variables: [...d.variables, { type: 'divider', id: newId('div') }] };
    });
  };

  React.useEffect(() => {
    ensureDivider();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateCond = (id, patch) => {
    setDraft((d) => ({
      ...d,
      conditions: d.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const removeCond = (id) => {
    setDraft((d) => ({
      ...d,
      conditions: d.conditions.filter((c) => c.id !== id),
    }));
  };

  const updateVar = (id, patch) => {
    setDraft((d) => ({
      ...d,
      variables: d.variables.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const removeVar = (id) => {
    setDraft((d) => ({
      ...d,
      variables: d.variables.filter((c) => c.id !== id),
    }));
  };

  const dividerIndex = draft.variables.findIndex((x) => x.type === 'divider');

  return (
    <div className="flex min-h-[560px] flex-col gap-4 px-2 lg:flex-row lg:px-4">
      {/* Conditions */}
      <div className="relative flex min-w-0 flex-1 flex-col rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-[var(--sl-text)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Conditions
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addCondition}
              className="rounded-lg bg-[var(--sl-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-95"
            >
              + Condition
            </button>
            <button
              type="button"
              onClick={addConditionCategory}
              className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-1.5 text-sm text-[var(--sl-text)] hover:border-[var(--sl-text-muted)]"
            >
              + Category
            </button>
          </div>
        </div>
        <div className="relative flex gap-3">
          <div className="relative w-8 shrink-0 border-l-2 border-[var(--sl-red)]/80 pt-2 opacity-90">
            <div className="absolute -left-1 bottom-8 top-0 w-0 border-l-2 border-[var(--sl-red)]/60" />
            <span className="font-mono-label absolute bottom-0 left-1 rotate-0 text-[9px] font-bold uppercase text-[var(--sl-red)]">
              NO → Skip
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2 rounded-md border border-dashed border-[var(--sl-green)]/40 bg-[rgba(34,197,94,0.06)] px-2 py-1 text-center text-xs font-medium text-[var(--sl-green)]">
              Trade Opportunity
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCondDragEnd}>
              <SortableContext items={conditionIds} strategy={verticalListSortingStrategy}>
                {draft.conditions.map((c, idx) => (
                  <div key={c.id}>
                    {c.type === 'category' && (
                      <SortableRow id={c.id} className="mb-2">
                        <div
                          className="flex items-center justify-between rounded-lg border px-2 py-2"
                          style={{ borderColor: c.bd, background: c.bg }}
                        >
                          <span className="font-mono-label text-[11px] font-bold uppercase" style={{ color: c.color }}>
                            {c.label}
                          </span>
                          <button type="button" onClick={() => removeCond(c.id)} className="text-[var(--sl-red)] hover:opacity-90">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={c.label}
                          onChange={(e) => updateCond(c.id, { label: e.target.value })}
                          className="mt-1 w-full bg-transparent text-xs text-[var(--sl-text-muted)] focus:outline-none"
                          placeholder="Category label"
                        />
                      </SortableRow>
                    )}
                    {c.type === 'condition' && (
                      <SortableRow id={c.id} className="mb-2">
                        <div className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Diamond className="shrink-0 text-[var(--sl-accent)]" size={18} />
                              <input
                                type="text"
                                value={c.name}
                                onChange={(e) => updateCond(c.id, { name: e.target.value })}
                                className="min-w-0 flex-1 bg-transparent font-semibold text-[var(--sl-text)] focus:outline-none"
                                placeholder="Condition name"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <TypeBadge type={c.ctype} />
                              <select
                                value={c.ctype}
                                onChange={(e) => updateCond(c.id, { ctype: e.target.value, options: e.target.value === 'multi' ? c.options || ['A'] : [] })}
                                className="rounded border border-[var(--sl-border)] bg-[var(--sl-card)] px-1 py-0.5 text-xs text-[var(--sl-text)]"
                              >
                                <option value="yesno">yes / no</option>
                                <option value="multi">multi</option>
                              </select>
                              <button type="button" onClick={() => removeCond(c.id)} className="text-[var(--sl-red)]">
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          <textarea
                            value={c.note || ''}
                            onChange={(e) => updateCond(c.id, { note: e.target.value })}
                            placeholder="Add a note…"
                            rows={2}
                            className="mt-2 w-full resize-none bg-transparent text-[11px] italic text-[var(--sl-text-sec)] placeholder:text-[var(--sl-text-faint)] focus:outline-none"
                          />
                          {c.ctype === 'multi' && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {(c.options || []).map((opt, i) => (
                                <input
                                  key={i}
                                  type="text"
                                  value={opt}
                                  onChange={(e) => {
                                    const next = [...(c.options || [])];
                                    next[i] = e.target.value;
                                    updateCond(c.id, { options: next });
                                  }}
                                  className="rounded-full border border-[var(--sl-border)] bg-[var(--sl-card)] px-2 py-0.5 text-xs"
                                />
                              ))}
                              <button
                                type="button"
                                className="text-xs text-[var(--sl-accent)]"
                                onClick={() => updateCond(c.id, { options: [...(c.options || []), 'Option'] })}
                              >
                                + pill
                              </button>
                            </div>
                          )}
                        </div>
                        {idx < draft.conditions.length - 1 && (
                          <div className="ml-6 flex items-center gap-1 py-1 text-[var(--sl-green)]">
                            <span className="h-6 w-px bg-[var(--sl-green)]" />
                            <span className="text-[10px] font-bold">YES</span>
                            <span className="h-6 w-px bg-[var(--sl-green)]" />
                          </div>
                        )}
                      </SortableRow>
                    )}
                  </div>
                ))}
              </SortableContext>
            </DndContext>
            <div className="mt-4 rounded-lg border border-[var(--sl-green)] bg-[rgba(34,197,94,0.08)] px-3 py-2 text-center text-sm font-semibold text-[var(--sl-green)]">
              All conditions passed → ENTER TRADE
            </div>
          </div>
        </div>
      </div>

      {/* Variables */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-4">
        <div className="mb-3 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] p-3 text-xs text-[var(--sl-text-sec)]">
          <span className="font-mono-label font-bold text-[var(--sl-green)]">PRE</span> — tagged at entry. Filterable in analytics.
          <br />
          <span className="font-mono-label font-bold text-[var(--sl-purple)]">POST</span> — after close. For self-review.
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-[var(--sl-text)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Variables
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addVariable('pre')}
              className="rounded-lg bg-[var(--sl-green)]/90 px-3 py-1.5 text-sm font-medium text-white hover:opacity-95"
            >
              + Variable (Pre)
            </button>
            <button
              type="button"
              onClick={() => addVariable('post')}
              className="rounded-lg bg-[var(--sl-purple)]/90 px-3 py-1.5 text-sm font-medium text-white hover:opacity-95"
            >
              + Variable (Post)
            </button>
            <button
              type="button"
              onClick={() => addVariableCategory('pre')}
              className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-2 py-1.5 text-xs text-[var(--sl-text)]"
            >
              + Cat Pre
            </button>
            <button
              type="button"
              onClick={() => addVariableCategory('post')}
              className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-2 py-1.5 text-xs text-[var(--sl-text)]"
            >
              + Cat Post
            </button>
          </div>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onVarDragEnd}>
          <SortableContext items={variableIds} strategy={verticalListSortingStrategy}>
            {draft.variables.map((v, idx) => {
              if (v.type === 'divider') {
                return (
                  <div
                    key={v.id}
                    className="my-4 flex items-center gap-2 border-t border-dashed border-[var(--sl-border)] pt-4"
                  >
                    <span className="font-mono-label text-[11px] font-bold uppercase text-[var(--sl-text-muted)]">
                      Post-trade
                    </span>
                  </div>
                );
              }
              if (v.type === 'category') {
                const isPre = dividerIndex < 0 || idx < dividerIndex;
                return (
                  <SortableRow key={v.id} id={v.id} className="mb-2">
                    <div
                      className="flex items-center justify-between rounded-lg border px-2 py-2"
                      style={{ borderColor: v.bd, background: v.bg }}
                    >
                      <span className="font-mono-label text-[11px] font-bold uppercase" style={{ color: v.color }}>
                        {v.label}
                      </span>
                      <button type="button" onClick={() => removeVar(v.id)} className="text-[var(--sl-red)]">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={v.label}
                      onChange={(e) => updateVar(v.id, { label: e.target.value })}
                      className="mt-1 w-full bg-transparent text-xs text-[var(--sl-text-muted)] focus:outline-none"
                    />
                  </SortableRow>
                );
              }
              const isPre = v.timing === 'pre';
              return (
                <SortableRow key={v.id} id={v.id} className="mb-2">
                  <div className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={`font-mono-label rounded px-2 py-0.5 text-[9px] font-bold uppercase ${
                          isPre ? 'bg-[rgba(34,197,94,0.2)] text-[var(--sl-green)]' : 'bg-[rgba(168,85,247,0.2)] text-[var(--sl-purple)]'
                        }`}
                      >
                        {isPre ? 'PRE' : 'POST'}
                      </span>
                      <input
                        type="text"
                        value={v.name}
                        onChange={(e) => updateVar(v.id, { name: e.target.value })}
                        className="min-w-0 flex-1 bg-transparent font-semibold text-[var(--sl-text)] focus:outline-none"
                      />
                      <TypeBadge type={v.vtype === 'multi' ? 'multi' : 'yesno'} />
                      <select
                        value={v.vtype}
                        onChange={(e) => updateVar(v.id, { vtype: e.target.value, options: e.target.value === 'multi' ? v.options || ['A'] : [] })}
                        className="rounded border border-[var(--sl-border)] bg-[var(--sl-card)] px-1 py-0.5 text-xs"
                      >
                        <option value="yesno">yes / no</option>
                        <option value="multi">multi</option>
                      </select>
                      <button type="button" onClick={() => removeVar(v.id)} className="text-[var(--sl-red)]">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <textarea
                      value={v.note || ''}
                      onChange={(e) => updateVar(v.id, { note: e.target.value })}
                      placeholder="Add a note…"
                      rows={2}
                      className="mt-2 w-full resize-none bg-transparent text-[11px] italic text-[var(--sl-text-sec)] placeholder:text-[var(--sl-text-faint)] focus:outline-none"
                    />
                    {v.vtype === 'multi' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(v.options || []).map((opt, i) => (
                          <input
                            key={i}
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const next = [...(v.options || [])];
                              next[i] = e.target.value;
                              updateVar(v.id, { options: next });
                            }}
                            className="rounded-full border border-[var(--sl-border)] bg-[var(--sl-card)] px-2 py-0.5 text-xs"
                          />
                        ))}
                        <button
                          type="button"
                          className="text-xs text-[var(--sl-accent)]"
                          onClick={() => updateVar(v.id, { options: [...(v.options || []), 'Option'] })}
                        >
                          + pill
                        </button>
                      </div>
                    )}
                  </div>
                </SortableRow>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
