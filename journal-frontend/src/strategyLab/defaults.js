export const SL_COLORS = {
  orderFlow: { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)', bd: '#06b6d4' },
  priceAction: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', bd: '#f97316' },
  context: { color: '#2643F7', bg: 'rgba(38,67,247,0.12)', bd: '#2643F7' },
};

export const PRE_VAR_COLORS = {
  market: { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)', bd: '#06b6d4' },
  timing: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', bd: '#f97316' },
  setup: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', bd: '#22c55e' },
};

export const POST_VAR_COLORS = {
  execution: { color: '#a855f7', bg: 'rgba(168,85,247,0.12)', bd: '#a855f7' },
  psychology: { color: '#a855f7', bg: 'rgba(168,85,247,0.1)', bd: '#7c3aed' },
};

export function emptyDraft() {
  return {
    name: '',
    description: '',
    instrument: '',
    style: '',
    direction: 'both',
    timeframe: '',
    conditions: [],
    variables: [],
  };
}

export function definitionFromDraft(d) {
  return {
    instrument: d.instrument || '',
    style: d.style || '',
    direction: d.direction || 'both',
    timeframe: d.timeframe || '',
    conditions: d.conditions || [],
    variables: d.variables || [],
  };
}

export function draftFromApi(strategy) {
  const def = strategy.strategy_definition || {};
  return {
    name: strategy.name || '',
    description: strategy.description || '',
    instrument: def.instrument || '',
    style: def.style || '',
    direction: def.direction || 'both',
    timeframe: def.timeframe || '',
    conditions: Array.isArray(def.conditions) ? def.conditions : [],
    variables: Array.isArray(def.variables) ? def.variables : [],
  };
}
