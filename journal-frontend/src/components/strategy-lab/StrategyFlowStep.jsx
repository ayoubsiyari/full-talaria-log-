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
import { GripVertical, Trash2, Diamond } from 'lucide-react';
import { newId } from '../../strategyLab/ids';
import { SL_COLORS } from '../../strategyLab/defaults';

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

/** Keep [category, ...its conditions, category, ...] contiguous after reordering. */
function flattenConditionsByCategory(conditions) {
  const categories = conditions.filter((c) => c.type === 'category');
  if (!categories.length) {
    return conditions;
  }
  const orderIndex = (id) => conditions.findIndex((x) => x.id === id);
  const out = [];
  for (const cat of categories) {
    out.push(cat);
    const conds = conditions.filter((c) => c.type === 'condition' && c.catId === cat.id);
    conds.sort((a, b) => orderIndex(a.id) - orderIndex(b.id));
    out.push(...conds);
  }
  const used = new Set(out.map((x) => x.id));
  const orphans = conditions.filter((c) => c.type === 'condition' && !used.has(c.id));
  for (const o of orphans) {
    const catId = categories[0].id;
    const catIdx = out.findIndex((x) => x.id === catId);
    let insertAt = catIdx >= 0 ? catIdx + 1 : out.length;
    while (insertAt < out.length && out[insertAt].type === 'condition' && out[insertAt].catId === catId) {
      insertAt++;
    }
    out.splice(insertAt, 0, { ...o, catId });
  }
  return out;
}

export default function StrategyFlowStep({ draft, setDraft }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const conditionIds = useMemo(() => draft.conditions.map((c) => c.id), [draft.conditions]);

  const onCondDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((d) => {
      const oldIndex = d.conditions.findIndex((x) => x.id === active.id);
      const newIndex = d.conditions.findIndex((x) => x.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return d;
      const moved = arrayMove(d.conditions, oldIndex, newIndex);
      const activeItem = d.conditions[oldIndex];
      if (activeItem.type === 'condition') {
        const target = moved[newIndex];
        let newCatId = activeItem.catId;
        if (target.type === 'category') newCatId = target.id;
        else if (target.type === 'condition') newCatId = target.catId;
        const patched = moved.map((x) =>
          x.id === activeItem.id && x.type === 'condition' ? { ...x, catId: newCatId } : x
        );
        return { ...d, conditions: flattenConditionsByCategory(patched) };
      }
      return { ...d, conditions: flattenConditionsByCategory(moved) };
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

  /** Insert a new condition immediately under this category (before the next category). */
  const addConditionToCategory = (categoryId) => {
    setDraft((d) => {
      let conds = [...d.conditions];
      const catIdx = conds.findIndex((c) => c.type === 'category' && c.id === categoryId);
      if (catIdx < 0) return d;
      let insertAt = catIdx + 1;
      while (insertAt < conds.length && conds[insertAt].type === 'condition') {
        insertAt++;
      }
      const node = {
        type: 'condition',
        id: newId('cond'),
        catId: categoryId,
        name: 'New condition',
        note: '',
        ctype: 'yesno',
        options: [],
      };
      conds.splice(insertAt, 0, node);
      return { ...d, conditions: conds };
    });
  };

  const updateCond = (id, patch) => {
    setDraft((d) => ({
      ...d,
      conditions: d.conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const removeCond = (id, type) => {
    setDraft((d) => {
      if (type === 'category') {
        return {
          ...d,
          conditions: d.conditions.filter((c) => c.id !== id && (c.type !== 'condition' || c.catId !== id)),
        };
      }
      return {
        ...d,
        conditions: d.conditions.filter((c) => c.id !== id),
      };
    });
  };

  const categoriesInOrder = useMemo(
    () => draft.conditions.filter((c) => c.type === 'category'),
    [draft.conditions]
  );

  const conditionsByCategory = useMemo(() => {
    const map = new Map();
    for (const cat of categoriesInOrder) {
      map.set(
        cat.id,
        draft.conditions.filter((c) => c.type === 'condition' && c.catId === cat.id)
      );
    }
    return map;
  }, [draft.conditions, categoriesInOrder]);

  const renderConditionCard = (c, idxInGroup, groupLen) => (
    <SortableRow id={c.id} key={c.id} className="mb-2">
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
              onChange={(e) =>
                updateCond(c.id, {
                  ctype: e.target.value,
                  options: e.target.value === 'multi' ? c.options || ['A'] : [],
                })
              }
              className="rounded border border-[var(--sl-border)] bg-[var(--sl-card)] px-1 py-0.5 text-xs text-[var(--sl-text)]"
            >
              <option value="yesno">yes / no</option>
              <option value="multi">multi</option>
            </select>
            <button type="button" onClick={() => removeCond(c.id, 'condition')} className="text-[var(--sl-red)]">
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
      {idxInGroup < groupLen - 1 && (
        <div className="ml-6 flex items-center gap-1 py-1 text-[var(--sl-green)]">
          <span className="h-6 w-px bg-[var(--sl-green)]" />
          <span className="text-[10px] font-bold">YES</span>
          <span className="h-6 w-px bg-[var(--sl-green)]" />
        </div>
      )}
    </SortableRow>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h2 className="mb-6 text-xl font-bold text-[var(--sl-text)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
        Strategy flow
      </h2>
      <div className="relative flex min-h-[560px] min-w-0 flex-col rounded-xl border border-[var(--sl-border)] bg-[var(--sl-card)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-[var(--sl-text)]" style={{ fontFamily: 'Outfit, sans-serif' }}>
            Conditions
          </h3>
          <button
            type="button"
            onClick={addConditionCategory}
            className="rounded-lg border border-[var(--sl-border)] bg-[var(--sl-input)] px-3 py-1.5 text-sm text-[var(--sl-text)] hover:border-[var(--sl-text-muted)]"
          >
            + Category
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--sl-text-muted)]">
          Add a category, then use <span className="text-[var(--sl-text-sec)]">+ Condition</span> inside that category.
          Conditions only apply within the category you add them to.
        </p>

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

            {!categoriesInOrder.length ? (
              <div className="rounded-lg border border-dashed border-[var(--sl-border)] bg-[var(--sl-input)]/40 px-4 py-8 text-center text-sm text-[var(--sl-text-muted)]">
                No categories yet. Click <strong className="text-[var(--sl-text-sec)]">+ Category</strong> to create a
                group, then add conditions inside it.
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onCondDragEnd}>
                <SortableContext items={conditionIds} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-5">
                    {categoriesInOrder.map((cat) => {
                      const conds = conditionsByCategory.get(cat.id) || [];
                      return (
                        <div
                          key={cat.id}
                          className="rounded-xl border border-[var(--sl-border)] bg-[var(--sl-bg)]/80 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        >
                          <SortableRow id={cat.id} className="mb-3">
                            <div>
                              <div
                                className="flex items-center justify-between rounded-lg border px-3 py-2"
                                style={{ borderColor: cat.bd, background: cat.bg }}
                              >
                                <span
                                  className="font-mono-label text-[11px] font-bold uppercase"
                                  style={{ color: cat.color }}
                                >
                                  {cat.label}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeCond(cat.id, 'category')}
                                  className="text-[var(--sl-red)] hover:opacity-90"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              <input
                                type="text"
                                value={cat.label}
                                onChange={(e) => updateCond(cat.id, { label: e.target.value })}
                                className="mt-2 w-full bg-transparent text-xs text-[var(--sl-text-muted)] focus:outline-none"
                                placeholder="Category label"
                              />
                            </div>
                          </SortableRow>

                          <div className="ml-1 border-l-2 border-[var(--sl-accent)]/30 pl-3">
                            {conds.length === 0 ? (
                              <p className="mb-2 text-[11px] italic text-[var(--sl-text-muted)]">No conditions in this category yet.</p>
                            ) : (
                              conds.map((c, i) => renderConditionCard(c, i, conds.length))
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => addConditionToCategory(cat.id)}
                            className="mt-3 w-full rounded-lg border border-dashed border-[var(--sl-accent)]/50 bg-[rgba(38,67,247,0.08)] py-2 text-sm font-medium text-[var(--sl-accent-light)] transition hover:bg-[rgba(38,67,247,0.15)]"
                          >
                            + Condition in “{cat.label || 'category'}”
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            <div className="mt-4 rounded-lg border border-[var(--sl-green)] bg-[rgba(34,197,94,0.08)] px-3 py-2 text-center text-sm font-semibold text-[var(--sl-green)]">
              All conditions passed → ENTER TRADE
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
