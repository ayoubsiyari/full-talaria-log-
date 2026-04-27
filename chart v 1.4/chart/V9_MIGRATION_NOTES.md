# V9 Design System — Migration Notes

This document records what changed in the chart UI to apply the new V9 design from `talaria-design /` while keeping every existing tool, button, script, and module integration working.

## Files changed

| File | Change |
|---|---|
| `chart/index.html` | Added Exo 2 Google Font, added `<link>` to `modules/v9-design.css` |
| `chart/modules/v9-design.css` | **NEW** — full V9 design system stylesheet (1500+ lines) |
| `chart/V9_MIGRATION_NOTES.md` | **NEW** — this document |

**Files NOT changed** (intentionally — preserves all behavior):
- `chart.js`
- `modules/panel-manager.js`, `modules/order-manager.js`, `modules/drawing-tools-manager.js`, `modules/replay-system.js`, `modules/economic-news-sidebar.js`, `modules/keyboard-shortcuts.js`, `modules/timeframe-favorites.js`, `modules/propfirm-tracker.js`, `modules/compare-overlay.js`, `modules/timezone-manager.js`, `modules/order-event-bus.js`, `modules/favorites-manager.js`
- `settings-panel.js`, `settings-panel-ext.js`
- All `<script>` tags, all event handlers, all DOM IDs.

## Approach

V9 design system is applied as a **last-loaded stylesheet** (`modules/v9-design.css`) so its rules override the legacy inline `<style>` in `index.html`. Tokens are defined as CSS custom properties on `:root`, and existing IDs/classes are re-skinned through targeted selectors with `!important` to win specificity battles against legacy `style` attributes.

Every existing element ID/class is preserved, so module JS that queries the DOM continues to find what it expects.

## What was applied per phase

### Phase 0 — Foundation
- Loaded **Exo 2** font (weights 400–900) via Google Fonts.
- Defined V9 tokens on `:root`:
  - Accent (blue): `--v9-ac`, `--v9-acL`, `--v9-acD`, `--v9-acB`, `--v9-acG`
  - Brand gold: `--v9-gold`, `--v9-goldD`
  - Surfaces: `--v9-bg`, `--v9-sf`, `--v9-el`, `--v9-well`
  - Borders: `--v9-br`, `--v9-brL`, `--v9-brH`
  - Text: `--v9-tx`, `--v9-ts`, `--v9-tm`
  - Semantic: `--v9-gn`, `--v9-gnD`, `--v9-gnB`, `--v9-rd`, `--v9-rdD`, `--v9-rdB`
  - Chart: `--v9-axTx`, `--v9-grid`
  - Sizing: `--v9-topbar-h`, `--v9-leftrail-w`, `--v9-replaybar-h`, `--v9-positions-h`, `--v9-orderpanel-w`, `--v9-bottom-strip-h`
  - Transitions: `--v9-trans-fast` (0.12s), `--v9-trans` (0.15s), `--v9-trans-panel` (0.2s)
- Defined helper classes: `.v9-active-underline`, `.v9-hover-underline`, `.v9-pb`, `.v9-pb--primary`, `.v9-pb--sm`, `.v9-sel`, `.v9-toggle`, `.v9-diamond`, `.v9-mini-in`, `.v9-num`, `.v9-separator`, `.v9-section-header`, `.v9-empty-state`.

### Phase 1 — Top Bar
- `.toolbar` re-skinned with V9 surface (`--v9-sf`), thin border, dark shadow.
- `.toolbar-icon-btn`, `.toolbar-icon-btn-dark`, `.toolbar-icon-btn-light` unified to V9 well-style: transparent default → `--v9-well` hover → `--v9-acD` active. Sharp 2px corners.
- Active icon buttons get blue accent text + glow.
- `.toolbar-support-link` → uppercase muted style.
- `.tool-divider` → vertical gradient-fade separator.
- `.new-order-btn` → V9 primary blue gradient with glow.
- **Toolbar height kept at 54px** (V9 spec is 36px) — changing it would break dozens of `top: 54px` and `calc(100vh - 54px)` references across modules. Documented for future structural pass.

### Phase 2 — Left Tool Rail
- `.tool-group-btn` and `.toolbar-drawing-icons .toolbar-icon-btn` re-skinned to V9 sharp tile look.
- Active tool: blue dim background + accent text + gradient-fade underline + blue glow.
- `.tool-divider` → vertical gradient-fade between tool groups.
- Tool flyout dropdowns (`.tool-flyout`, `.tool-dropdown`, `.tool-group-dropdown`) re-skinned: dark elevated bg, blue gradient top stripe, hover/active states.
- Active dropdown items get a rotated diamond indicator dot.
- Pin indicator (gold, -25° tilt + 1.15× scale on hover) styled.

### Phase 3 — Chart Area
- Background of `html`, `body`, `#chart-container`, `.container`, `.chart-wrapper`, `#panels-container` set to V9 `--v9-bg`.
- `#chartCanvas` background → transparent (canvas-rendered content unchanged).
- `.ohlc-overlay` and variants → glass-morphism style with V9 elevated bg, V9 typography.
- Rollback indicator: green/red color via `[data-rollback-state]` attribute.
- Crosshair tooltips and axis-label pills re-skinned.

### Phase 4 — Replay Bar
- `.replay-toolbar` / `#replayToolbar` → V9 surface.
- All replay control buttons: V9 transparent → well hover → blue active.
- Play button green; pause-while-playing red.
- Speed slider (`<input type="range">`): V9 thin track + blue accent thumb (Webkit & Firefox).
- Stat readouts: V9 typography (uppercase muted labels, bold tabular-nums values).

### Phase 5 — Positions Panel
- `.positions-panel`, `.trade-history-panel`, `#positionsDock`, `#positionsPanel`, `.replay-positions-panel` → V9 surface.
- Tabs (`.tab`, `.tab-btn`, `[data-positions-tab]`) re-skinned with gradient-fade active underline.
- Tables: V9 typography, muted uppercase headers, hover-row highlight.
- P&L coloring via `.pnl-positive` / `.pnl-negative` / `[data-pnl="..."]`.

### Phase 6 — Order Panel
- `#orderPanel`, `.order-panel`, `.order-drawer` → V9 surface, font, shadow.
- Header → V9 with left-border accent.
- Close button → V9 well-style hover.
- BUY/SELL tabs → V9 well bg with green/red active glow.
- All inputs/selects → V9 well style with focus ring.
- Section headers → V9 micro-label.
- Execute button → V9 primary blue gradient with glow.
- Toggle switches → V9 active blue glow.

### Phase 7 — Right Sliding Panels
- `.right-sidebar-icons` → V9 sf surface.
- `.right-sidebar-icon-btn` → V9 hover/active states.
- `.right-sidebar-panel`, `.unified-right-panel`, `#unifiedRightPanel` → V9 sf surface, drop shadow.
- Panel tabs → gradient-fade active underline.
- List items → V9 hover well bg.

### Phase 8 — Floating Windows
- All `.modal`, `.dialog`, `.draggable-window`, `.floating-window`, `.compare-modal`, `.challenge-modal`, `.overlay-settings-popup`, `#challengeFailedModal`, `#challengePassedModal`, `#compareModalOverlay`, `#overlaySettingsPopup`, `#newPaneSettingsPopup`, `#sessionInfoPanel` → V9 elevated surface with thin border + drop shadow.
- Modal overlays → tinted backdrop with blur.
- Headers → draggable cursor, V9 typography.
- Close buttons → V9 hover well-style.
- Inputs/selects → V9 well style.
- Primary action buttons (Apply/Save/Submit) → V9 primary blue gradient.
- Secondary buttons (Cancel) → V9 well style.
- Entrance animation: 150ms fade + scale (0.98→1.0).

### Phase 9 — Tooltips
- `[data-tooltip]::after` re-skinned: V9 elevated bg, thin border, blue accent left stripe, white 10px/600 text.
- Existing tooltip system (legacy `data-tooltip` CSS) keeps showing/hiding per the original logic; only visual style updated.

### Phase 11 — Structural Placement (V9 layout)
- **Drawing tools moved to a real vertical LEFT RAIL** (was forced inline-horizontal in the top bar). `.left-sidebar` is now `position: fixed; top: 54px; left: 0; width: 46px; flex-direction: column;` over the existing 46px chart inset gutter.
- `.drawing-tools-vertical` switched from `flex-direction: row` to `column`.
- Tool group dropdowns (`.tool-dropdown`) now emerge to the **right** of the rail instead of below.
- Active-tool gradient-fade indicator rotated to a vertical right-edge accent.
- Group dividers (`.divider`, `.tool-divider`) inside the rail rendered as horizontal gradient lines.
- Top bar utility buttons reordered to V9 spec via CSS `order:`:
  - **Toolbar-left order**: Logo → Support → Symbol → ChartType → Indicators → Timeframes → Compare → Drawing utility (visibility/undo/redo/sync).
  - **Toolbar-right order**: Layout → Screenshot → Fullscreen → Global Markets → Objects Tree → Alerts → Settings → Help.
- `#chart-container { left: 46px }` confirmed; `.replay-toolbar { left: 46px }` set so the replay bar doesn't run under the rail.
- Responsive breakpoints kept (rail shrinks to 36px on tablet, hides on mobile <480px).
- **Zero HTML/JS changes** — all behavior preserved (drawing-tools-manager.js binds by ID, IDs unchanged; flex `order:` changes rendering only).

### Phase 10 — Polish
- Custom scrollbars: thin, V9 border color, blue hover.
- Universal `:focus-visible` ring → V9 accent border (keyboard a11y).
- Cursor states: pointer on interactive elements, not-allowed on disabled.
- `::selection` → V9 blue background.
- Backtesting loader → V9 dark backdrop.

## V9 design features intentionally NOT implemented

These features appear in the V9 JSX mockup but have no backing module in the existing chart. Skipping prevents adding non-functional UI:

- **Profile dialog** (Account / Billing tabs) — no backing module; the existing `profile-avatar-btn` opens the legacy profile flow.
- **FAQ window** (Education / FAQ / Hot Keys / About tabs) — existing `helpBtn` opens legacy help; FAQ tabs are not implemented.
- **Screenshot preview with simulated chart candles** — existing `screenshotBtn` uses the working module; the V9 preview decoration is omitted.
- **Go-To popup with Pinned/All/Add tabs for date/time/price** — partial implementation in the legacy goto popup; full V9 Pinned/All/Add UX would require a JS rewrite.
- **Talaria logo dropdown menu** (settings/profile) — legacy uses individual buttons; logo is currently a link to `/dashboard/`.
- **Layout slide-in panel for panel layouts** — opening currently goes through the existing `_openMode('panellayout')` settings-panel flow.

If you want any of these built, that's a Phase 11+ item and requires JS changes (out of scope for the design-only pass).

## Known visual deltas vs V9 mockup

These are differences kept intentionally for safety/compatibility:

1. **Top bar height**: 54px (existing) vs V9 spec 36px. Reason: dozens of CSS rules and module calculations anchor on `top: 54px` and `calc(100vh - 54px)`. Changing it requires a coordinated structural pass across `index.html`, `modules/order-manager.js` (line 7250), and several CSS blocks.
2. **Replay bar**: existing markup uses a multi-row layout (controls + stats); V9 spec shows a single 28px row. Visual styling matches V9 but row structure preserved.
3. **Positions panel height**: existing legacy heights kept; V9 110px not enforced.

## How to roll back

If anything breaks visually:

1. Comment out the `<link rel="stylesheet" href="modules/v9-design.css">` in `chart/index.html` (line ~21).
2. Reload. The chart returns to its pre-V9 appearance with zero functional impact.

## How to extend

To add a V9 style for a new section:
- Add the rule(s) inside `chart/modules/v9-design.css` between phase boundaries.
- Use `!important` only when overriding legacy inline-CSS (which is most of the time here).
- Always reuse `--v9-*` tokens — never hardcode hex.
- Test that `chart.js` + relevant module JS still work (DOM IDs/classes must remain).

## Source-of-truth references

- `talaria-design /DESIGN_SYSTEM_V9.md`
- `talaria-design /WORKING_INSTRUCTIONS_V9.md`
- `talaria-design /HANDOFF_PROMPT_V9.md`
- `talaria-design /FINAL_UI_REVIEW_PROMPT.md`
- `talaria-design /talaria-_V9.jsx` (and `src/TalariaV8b.jsx` for the full JSX mockup)
