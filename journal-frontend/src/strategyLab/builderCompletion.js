/**
 * Builder checklist for Strategies Lab wizard (display-only; does not gate navigation).
 */
export function computeBuilderCompletion(draft) {
  const nameOk = (draft.name || '').trim().length > 0;
  const mc = draft.market_categories || [];
  const inst = draft.instruments || [];
  const hasScope = mc.length > 0 || inst.length > 0 || !!(draft.instrument && String(draft.instrument).trim());
  const generalDone = nameOk && hasScope;

  const conditions = draft.conditions || [];
  const flowDone = conditions.some((c) => c.type === 'condition');

  const variables = draft.variables || [];
  const variablesDone = variables.some((v) => v.type === 'variable');

  /** Review step is “complete” when core identity + flow are ready to save meaningfully. */
  const reviewReady = generalDone && flowDone;

  const sections = [
    { step: 1, label: 'General', done: generalDone },
    { step: 2, label: 'Flow', done: flowDone },
    { step: 3, label: 'Variables', done: variablesDone, optional: true },
    { step: 4, label: 'Review', done: reviewReady },
  ];

  const completedCount = sections.filter((s) => s.done).length;

  return {
    sections,
    completedCount,
    total: 4,
    generalDone,
    flowDone,
    variablesDone,
    reviewReady,
  };
}
