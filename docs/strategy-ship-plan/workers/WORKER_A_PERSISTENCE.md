# Worker A Brief — Persistence & Lifecycle

**Manager:** see `../01_MANAGER_PROTOCOL.md`. Report after EVERY task via
`../templates/TASK_REPORT_TEMPLATE.md` → `../reports/A/<TASK_ID>.md`.

## 1. Ownership zone (WRITE access)

- `Sources Handoff/TalariaV16.jsx`: top-of-file helpers (**lines ~1–1523**: boot bank
  helpers `getV16StrategyBank`, `mergeV16StrategyBankRows`, `getV16StrategyBankRows`,
  `strategyRowKey`, `parseStratApiId`, name/TF helpers at ~392–430) and the builder
  lifecycle block (**~46016–46392**: `resetStrategyBuilderForm`,
  `fillStrategyBuilderFromTemplate`, `openBuilder`, `copyStrategyIntoBank`,
  `copyCommunityStrategyIntoBank`, delete flow `runDelete`, `saveBuilder`).
- `homepage/src/app/dashboard/v16/` — all files.
- `homepage/src/app/dashboard/strategies/**`.
- `journal-backend/` — strategy/template routes and schemas ONLY; never touch auth
  decorators, security config, or unrelated routes.

Line numbers drift — re-locate symbols first, record actual ranges in each report.
Anything outside this zone: file an ICR (`../templates/ICR_TEMPLATE.md`).

## 2. Phase 1 tasks (critical)

### A1 — Failed/empty bank refresh must not vanish saved strategies 🔴
**Bug:** `mergeV16StrategyBankRows` drops local rows with server IDs, trusting the boot
bank; but `useV16LiveBootstrap.ts:~233` catches fetch failures into `EMPTY_JOURNAL_PAYLOAD`,
so a failed refresh empties "My Strategies" while data still exists server-side.
**Fix intent:** distinguish *fetch failed* from *bank empty* (e.g., error/staleness flag on
the boot object or a null-vs-[] contract); on failure, keep the last known rows and expose
an error flag consumers can render (D consumes it — coordinate via manager, the flag
definition is yours).
**Acceptance:** with network blocked, refresh keeps the list intact and an error state is
available; with a genuinely empty server bank, the list correctly shows empty.
**Verify:** DevTools offline → trigger refresh → list unchanged + flag set; restore network
→ refresh reconciles. Round-trip save/reload still works.

### A2 — Pessimistic delete with real error UX 🔴
**Bug:** `runDelete` removes the row locally before the API call; failure → `window.alert`
+ swallowed refresh; row can stay wrongly gone or flicker back.
**Fix intent:** await the API before removing (or roll back on failure); replace
`window.alert` with the app's in-app notice mechanism (`openAppConfirm`/toast pattern
already in file); surface refresh failure.
**Acceptance:** failed delete leaves the row in place with a visible message; success
removes it; double-clicking delete cannot fire twice.
**Verify:** simulate 500/offline on DELETE; confirm row persists + message; confirm success
path; confirm builder closes if the deleted strategy was being edited (existing behavior).

### A3 — Template application must not silently destroy an edit session 🔴
**Bug:** `fillStrategyBuilderFromTemplate` always `setStratEditId(null)` and wipes all
fields; reachable from inside the builder while editing → user's edit becomes a new
unsaved strategy without warning.
**Fix intent:** if `stratEditId` is set OR the form is dirty, require confirmation before
applying (reuse `openAppConfirm`); make the outcome explicit in the confirm copy
("this replaces your current work"). Whether edit-id is preserved or cleared after
confirm: clearing is acceptable *if the user confirmed*; preserve dirty-check semantics
consistent with B1 (close-confirm) — align wording with Worker B via manager.
**Acceptance:** applying a template mid-edit always warns; declining changes nothing.
**Verify:** edit existing strategy → Templates → pick → decline (state intact) → accept
(replaced, and save behavior is what the confirm text promised).

## 3. Phase 2 tasks (high)

### A4 — Pre-save payload budget 🟠
Estimator (`estimateStrategyBuilderPayloadBytes`, in B's zone — read-only for you)
undercounts; backend `MAX_CONTENT_LENGTH` is 16 MB. Add a hard pre-flight check in
`saveBuilder` against a conservative budget (e.g., serialize the actual request body or
apply a safety margin); block with a clear in-modal error *before* upload. Keep frontend
image caps aligned with `shared/constants.json` / backend `MAX_COVER_IMAGE_LEN`.
**Verify:** build an oversized strategy → save blocked with message, no network request;
normal strategies unaffected.

### A5 — Canvas conditions → root `strategy_definition.conditions`; load `tree` on edit 🟠
`saveBuilder` persists stale `stratBConditions` (usually `[]`); flow lives only in
`talaria_v9.canvasNodes`. Derive a flattened conditions list from `canvasNodes` at save
(same derivation the Review step uses) and write it to root `conditions`. Also restore
`tree` in `openBuilder` and reset it in `resetStrategyBuilderForm`.
**Verify:** save a canvas strategy → inspect API body: root conditions populated; edit →
reopen → nothing lost; legacy strategies still load.

### A6 — Surface bank fetch failures 🟠
`v16JournalMappers.ts` leaves `strategies: []` on non-OK with no signal. Wire the failure
into the same error flag from A1 so the page can show "couldn't load your strategies —
retry" instead of a false empty state.
**Verify:** force 401/500 on GET /strategies → error state, not empty-bank UI.

### Sub-tasks you will receive via ICR
- **ICR-1 (from B):** one guard clause in `saveBuilder` enforcing the 6-timeframe cap +
  case-normalized dedupe at save.
- **ICR-4 (from D):** `openBuilder` must prefer saved `editStrat.markets` over
  instrument-derived markets when both exist.

## 4. Phase 3 task

### A7 — Duplicate-name normalization alignment ⚪
`findStrategyBankNameDuplicate` uses exact lowercase match while session-metrics linking
uses `normalizeStrategyBankNameKey` (punctuation-insensitive). Align the duplicate check
to the normalized key (watch for false positives on legitimately distinct names — if
ambiguous, warn rather than hard-block, and note it in your report). Backend uniqueness
is Director decision D-3 — do NOT implement unless told.

## 5. Phase 4 cross-cutting verification (yours)

On the integrated build: full persistence section of the manager checklist + a
round-trip field audit (save → reload → diff every field: name, desc, markets,
instruments, support, timeframes incl. custom, tags, images, emoji, canvas nodes/edges,
variables, tree, conditions). File `../reports/A/PHASE4_VERIFY.md`.

## 6. Guardrails

- Never weaken `@jwt_required`, CSRF, or size limits to make a save pass.
- No new dependencies. No DB migrations without escalation.
- `mergeV16StrategyBankRows` semantics are subtle — add/adjust behavior only with the
  failure-flag approach; document the new contract in your report.
