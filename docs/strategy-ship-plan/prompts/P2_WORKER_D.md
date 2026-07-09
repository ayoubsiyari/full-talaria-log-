# PROMPT — Worker D — Phase 2 (Bank Page & instantiation sites)

You are **Worker D**. D1 done/verified. This turn you IMPLEMENT two ICRs others filed against
your zone, and FILE one ICR to A. **D2 is verify-only and waits for A** (ICR-4).
You now have exclusive access to `Sources Handoff/TalariaV16.jsx` (B just finished).

## 0. CRITICAL working rules
- **Exclusive file lock:** only you edit/save `TalariaV16.jsx` this turn. Do NOT let any
  build/codegen overwrite it. `git diff` to confirm your hunks are present before DONE.
- **Do NOT `git checkout`/switch branches or revert the file** — all prior work (A1/A2/A3, B1,
  C1/C2, B2/B3, D1) lives as uncommitted changes and MUST be preserved.
- Zone = strategy state decls (~11720–11970), bank page (~45400–46015), tab bar + instantiations
  (~46393–46930). Re-locate symbols by name. No new deps.
- `saveBuilder`/`openBuilder`/`fillStrategyBuilderFromTemplate` are A's — ICR only.

## 1. Implement ICR-2 (from B) — lift builder state to parent
Add parent state near the strat state block (~11720–11970) and pass as props at the
`StrategyBuilderModal` instantiation:
```jsx
const [stratBTfCustom, setStratBTfCustom] = useState([]);
const stratBMarketsManualRef = useRef(false);
```
Props at instantiation: `stratBTfCustom={stratBTfCustom}` `setStratBTfCustom={setStratBTfCustom}`
`stratBMarketsManualRef={stratBMarketsManualRef}`.
Semantics: `stratBTfCustom` = array of canonical custom TF tokens; `stratBMarketsManualRef.current`
= boolean, user manually chose markets vs symbol-derived. See `reports/B/ICR-2.md`. Update ICR-2
§5 with what you did + line ranges. (B consumes these in B4, a later turn.)

## 2. Implement ICR-3 (from C) — real hasExistingGroups
At the LIVE `TemplatePickerModal` instantiation (your zone, ~46801), replace the hardcoded
`hasExistingGroups={false}` with C's shared predicate:
```jsx
hasExistingGroups={strategyFlowHasMeaningfulTemplateContent(canvasNodes)}
```
Use C's exported predicate (defined ~3103) — do NOT inline a duplicate. See `reports/C/ICR-3.md`.
Update ICR-3 §5.
- **Double-confirm note (DO NOT solve here):** once this prop is live, picking a template while
  editing could fire C2's modal confirm AND A3's `fillStrategyBuilderFromTemplate` confirm. The
  fix (a `skipConfirm` param on A's function + passing it from the picker's onPick call site)
  is scheduled for A's turn; the Manager will coordinate a tiny call-site follow-up after A adds
  the param. For now: just wire `hasExistingGroups`; note in your report the exact onPick call
  site line so the Manager can wire skip later.

## 3. File ICR-4 → Worker A (openBuilder markets restore)
`reports/D/ICR-4.md`: `openBuilder` currently prefers instrument-derived markets over saved
`editStrat.markets` (see ~46108–46113 where `editDerivedMarkets` wins). Request: prefer saved
`editStrat.markets` when present; fall back to derived only if none saved. Give the exact
acceptance check (D2). You verify from the UI after A lands it.

## 4. Do NOT do this turn
- Do NOT implement D2's code change (that's A via ICR-4); D2 is your later verification.
- D3/D4 are Phase 3. Do not start them.

## 5. Report
Save to `reports/D/D2.md` (status BLOCKED-pending-ICR-4 for the verify part) + update ICR-2/ICR-3
§5 + file ICR-4. Paste all back. Include symbols + line ranges, the onPick call-site line, lint
result, `git diff` presence confirmation. Status: DONE (for ICR-2/ICR-3 impl) / BLOCKED (D2 verify).
