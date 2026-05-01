/**
 * Client-side checks before posting a strategy to the feed.
 */
export function validateStrategyForShare(strategy) {
  if (!strategy) {
    return { ok: false, reason: 'Strategy could not be loaded.' };
  }
  const name = (strategy.name || '').trim();
  if (!name) {
    return { ok: false, reason: 'Strategy needs a name.' };
  }
  const def = strategy.strategy_definition || {};
  const conditions = def.conditions || [];
  const hasCondition = conditions.some((c) => c.type === 'condition');
  if (!hasCondition) {
    return { ok: false, reason: 'Add at least one flow condition before sharing.' };
  }
  const mc = def.market_categories || [];
  const inst = def.instruments || [];
  const legacy = def.instrument;
  const hasScope =
    mc.length > 0 || inst.length > 0 || !!(legacy && String(legacy).trim());
  if (!hasScope) {
    return { ok: false, reason: 'Select at least one market or symbol so the post has context.' };
  }
  return { ok: true };
}
