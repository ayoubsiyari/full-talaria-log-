# PROMPT — Phase 4 STATIC cross-cutting verification: PERSISTENCE + BANK
# (Live-runtime/browser click-crawl is DEFERRED to the final Docker pass — do NOT block on it.)

## Fresh worker orientation
You may be a brand-new worker with no prior history on this project — that is fine, this prompt is
fully self-contained and READ-ONLY. Do NOT edit any files. You are verifying that already-completed
work is present and correct in the current integrated file by TRACING code paths. If something is
missing or wrong, record it as a FINDING (with the symbol + current line range) — do not fix it; the
manager will assign a fix task.

You are handling two verification bundles this turn: Persistence & Lifecycle and Bank page. This is a
READ/TRACE pass on the current integrated
`Sources Handoff/TalariaV16.jsx` (+ the v16 TS files for persistence). No edits expected. If you
find a defect, do NOT fix inline — report it as a finding; the manager assigns a fix task with
proper ownership/ICR.

## Rules
- Read-only intent. DO NOT switch branches/stash. If you must demonstrate something, use read-only
  commands (`rg`, `git diff`, `ReadLints`, `tsc --noEmit`). No file edits.
- Trace by symbol name. Note current line ranges in findings.

## Bundle 1 — Persistence & lifecycle (static trace)
Confirm by reading code paths (not browser):
- A1: `mergeV16StrategyBankRows` + boot merge preserve local rows when `strategyBankStale` true;
  authoritative empty when false. `useV16LiveBootstrap` refresh keeps current bank on failure.
- A6: `fetchJournalApiData` sets `strategyBankError` (no whole-payload throw); `fetchJournalPayload`
  propagates it; `buildBootFromPayloads` keeps journal/entries while only bank goes stale.
- A2: `runDelete`/`deleteStrategyFromBank` await API before local removal; failure keeps row +
  in-app notice (no `window.alert`); `strategyDeleteInFlightRef` guards double-fire.
- A4: `saveBuilder` image + `estimateStrategySavePayloadBytes` guards fire BEFORE `persist()`.
- A5: `saveBuilder` writes `deriveStrategyBuilderConditionsFromCanvas(canvasNodes)` to root
  conditions with legacy fallback; `openBuilder` restores `tree`.
- ICR-1: `saveBuilder` normalizes/dedupes/caps timeframes.
- A7: `findStrategyBankNameDuplicate` uses `normalizeStrategyBankNameKey` both sides.
- Confirm `tsc --noEmit` (homepage) exits 0 and `ReadLints` on the TS files is clean.

## Bundle 2 — Bank page (static trace)
- D1: `COMMUNITY_ENABLED` gating — only My Strategies renders; no dead "Use Strategy" controls;
  community fetch plumbing/backend routes still present but dormant.
- D3: `SORT_OPTIONS` = Name + Net P&L only; bank uses `stratSortOpen` (not `sessSortOpen`);
  My Strategies badge = `stratBankRows.length`.
- D4: `stratStyleFilter` + `normalizeStrategyBankName` alias gone; template action label "Hide",
  real delete "Delete" + confirm; `STYLES` const retained for the style dropdown.
- Confirm `mergeV16StrategyBankRows` semantics unchanged by D's work.

## Report
`reports/D/PHASE4_PERSISTENCE.md` and `reports/D/PHASE4_VERIFY.md`: a trace table per item
(symbol, current lines, expected, observed, pass/finding), lint/tsc results, and a list of any
defects found (with severity). Mark browser-only checks as "DEFERRED → final Docker pass".
Status: DONE (static) with findings listed, or BLOCKED.
