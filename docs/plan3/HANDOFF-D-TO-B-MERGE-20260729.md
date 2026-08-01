# Manager D Handoff To Manager B — Merge / On-Call

Date: 2026-07-29

## Merge Conflict Review

B is merging `manager-d/trade-correctness`. D is on call for every `order-manager.js` conflict hunk. Do not resolve money-path order hunks by one person.

D must review the resolved hunks that touch:

- order placement / `placeAdvancedOrder`
- pending order execution and classification
- SL/TP drag, commit, cancel, and preview state
- risk-based quantity calculation
- order IDs / trade journal / closed-position persistence
- balance/equity recompute
- order-line teardown and exact selectors

After the merge, run D's five drag/check-3 gates at minimum:

- `node "chart v 1.4/chart/modules/order-new-draft-constraint-reset.test.mjs"`
- `node "chart v 1.4/chart/modules/order-preview-live-recalc.test.mjs"`
- `node "chart v 1.4/chart/modules/order-risk-qty-live-preview-sl.test.mjs"`
- `node "chart v 1.4/chart/modules/order-block-place-during-preview-drag.test.mjs"`
- `node "chart v 1.4/chart/modules/order-multi-tp-coincident-stack.test.mjs"`

Recommended adjacent checks after conflict resolution:

- `node "chart v 1.4/chart/modules/order-cancel-before-confirm.test.mjs"`
- `node "chart v 1.4/chart/modules/order-risk-qty-on-sl-commit.test.mjs"`
- `node --test "chart v 1.4/chart/modules/multi-tp-preview-drag-sync.test.mjs"`
- full canonical and homepage `order-*.test.mjs` sweeps if time permits.

## Preferences Changes Outside D Grant

Commit `6ad9f48ec` (`prefs: persist pinned chart tools by user`) includes writes to `preferences-sync.js` and `preferences-init.js`. These were outside D's grant and are not Director-ratified by D. Bring them through B's merge only if B accepts the behavior.

Plain-language behavior:

- Adds `drawing_tool_favorites` as a user preference field alongside existing `timeframe_favorites`.
- Adds `window.saveDrawingToolFavorites(favorites)` and `window.loadDrawingToolFavorites()` in `preferences-init.js`.
- Makes `FavoritesManager` load drawing-tool pins from the preference bridge when available, while keeping `chart_favorite_tools` local storage in sync.
- On preference load, if the server/cloud arrays for `timeframe_favorites` or `drawing_tool_favorites` are empty but local user storage has pins, the merge preserves the local non-empty pins instead of wiping them.
- Queues the preserved pin arrays for sync back to the API so the cloud record catches up.
- Kill-switch: `__TALARIA_DISABLE_PINS_USER_PREFS_V1`.
- Gate: `pins-user-preferences.test.mjs` in both canonical and homepage module trees.

Risk for B to judge: this changes preference merge semantics from "empty cloud array wins" to "non-empty local pins survive empty cloud array" for timeframe and drawing-tool pins.

## Routed Residuals

M20-A re-pin residual:

- TOP re-review found `c0a0d7620` changed `timezone-manager.js` and broke an out-of-scope M20-A sha256 pin.
- This is non-money-path and does not affect order execution, but the M20-A owner must re-pin/re-review that gate before trusting it again.

TAL-01896 dist-v9 residual:

- Source is fixed and TOP accepted in `3fae85648`.
- The PO will not see the fix until both `dist-v9` bundles are rebuilt:
  - `chart v 1.4/chart/dist-v9/assets/talaria-v9-live.js`
  - `homepage/public/chart/dist-v9/assets/talaria-v9-live.js`
- B should schedule or own the bundle rebuild before PO visual verification of wrong all-trades duration.
