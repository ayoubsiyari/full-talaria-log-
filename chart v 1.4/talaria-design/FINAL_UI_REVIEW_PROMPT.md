# Talaria — Final UI/UX Review & Polish Pass

You are a senior frontend designer with deep knowledge of UI/UX best practices, design systems, and pixel-level alignment. Apply professional-grade scrutiny to every interactive surface in the project. The goal is production-ready polish — symmetrical, consistent, and predictable.

Review the entire project against the criteria below. Apply all fixes in a single comprehensive pass. Reference `DESIGN_SYSTEM.md` for established tokens — do not invent new patterns.

---

## 1. Button States & Feedback

Every interactive element (buttons, icon buttons, tool tiles, tabs, toggles, dropdown items, checkboxes) must have consistent states:

- **Hover**: subtle, predictable feedback — brightness lift, background tint, or underline. Same hover treatment across all similar elements.
- **Active / Pressed**: visually distinct from hover — clear indication the element is being clicked.
- **Selected / Active state**: when an item is selected (e.g., active tool, active tab, active timeframe), it must look meaningfully different from hover. Use the established blue gradient underline + accent color pattern.
- **Deselected**: returning to default state must be smooth, not jarring.
- **Disabled**: when applicable, use 40% opacity + cursor: not-allowed.
- **Focus**: keyboard focus visible (1px outline using accent color).
- **Transitions**: 0.12s–0.15s ease on all state changes. No instant snaps, no slow lags.

Audit every button in the project and ensure consistency.

---

## 2. Tooltips on Hover

**Add concise tooltips (1–3 words) to every icon-only button** where the function isn't immediately obvious from the icon. This includes:

- All drawing tool buttons in the left rail
- Top bar utility icons (layout, news, screenshot, fullscreen, etc.)
- Replay bar control icons (play, next, rollback, mode, go-to)
- Pin buttons, delete buttons, visibility toggles
- Color picker swatches (tooltip = the color name or "Click to change")
- Window header close/minimize buttons

**Tooltip style**: 
- Dark elevated background (`c.el`), 1px border (`c.brH`), small left blue accent stripe, white text 10px weight 600
- Position next to the button with 6-10px gap
- Appears after ~250ms hover delay, disappears immediately on mouse leave
- Never appears when a dropdown or window is already open from that button
- Tooltip itself must respect screen edges — flip side if it would overflow

Tooltips should be **brief and useful** — "Trend Line" not "Click to draw a trend line on the chart". For obvious icons (chevrons, x-close), no tooltip needed.

---

## 3. Window Management — One at a Time

Enforce strict single-window policy:

- **Floating windows** (Settings, Profile, FAQ, Screenshot, Indicators): opening any one MUST close all others — including any open dropdowns.
- **Sliding right panels** (News, Objects Tree, Layout, Order Panel): only one slot — opening any panel closes the currently-open one.
- **Dropdowns**: opening any dropdown closes other dropdowns and any open windows.
- **Color pickers and sub-popups**: closing the parent window must also close them.

Audit `closeWindows()` / `closeAll()` helpers and ensure they are called in every window-opening handler.

---

## 4. Smooth Open / Close Animations

- All windows fade in (opacity 0→1) with subtle scale (0.98→1.0) over 150ms ease-out.
- Sliding panels animate `width` 0→280px over 200ms ease, using the wrapper-div approach (outer animates width, inner stays fixed-width to prevent content reflow).
- Dropdowns fade + slight translateY(4px→0) over 100ms.
- Closing animations are equally smooth — no instant disappearance.

---

## 5. Screen Edge Constraints

**No element may render off-screen, behind the OS taskbar, or above the title bar.**

- **Draggable windows**: clamp position so the window stays within viewport. Account for the OS taskbar at the bottom (~40px reserved) and any browser chrome at the top.
- **Dropdowns**: if opening downward would overflow the bottom edge, flip and open upward. Same logic horizontally.
- **Sub-popups** (color pickers, timezone selectors, Go-To popup, indicator search): all must respect viewport boundaries.
- **Tooltips**: same rule — flip to the opposite side if needed.

Use `getBoundingClientRect()` to measure available space before positioning.

---

## 6. Color Pickers & Swatches

- **Audit all color buttons** to ensure consistent styling: same size, same well background, same border, same inset shadow.
- **Remove the opacity slider** from color pickers that control:
  - Lines (trend lines, support/resistance, drawing tool strokes)
  - Levels (Fibonacci levels, pivot levels)
  - Text and numbers (labels, axis text, OHLC display)
  - Border strokes
- **Keep the opacity slider** only for color pickers that control:
  - Background fills (chart background, panel backgrounds)
  - Spatial elements (zone fills, channel fills, rectangle fills)
  - Overlay elements (volume profile bars, session boxes)

Fix any color buttons that deviate from the established swatch style.

---

## 7. Tool Window Spacing & Separators

- **Within a section**: 2–4px vertical gap between rows.
- **Between sections**: 8–12px gap with a horizontal gradient-fade separator (`linear-gradient(90deg, transparent, c.br, transparent)`).
- **Section headers**: 7-8px font, weight 700, uppercase, letter-spacing 0.06em, muted color (`c.tm`), 4-5px margin below.
- Add separators where they improve scannability (e.g., between Appearance / Candle Colors / Canvas / Time in Settings).
- Do NOT over-separate — only divide logically distinct groups, not every row.

---

## 8. Alignment & Symmetry (apply OCD-level scrutiny)

- **Labels and values**: labels left-aligned, values right-aligned in setting rows. All values on the same row must align vertically with values on adjacent rows.
- **Icons + text**: icons vertically centered with their labels, consistent gap (5-6px).
- **Tab underlines**: gradient-fade underline must be perfectly centered under tab text (`left:15%; right:15%`).
- **Padding consistency**: all panel headers use the same padding. All input wells use the same padding. All buttons use the same height.
- **Row heights**: maintain consistent row heights within a section (e.g., all setting rows = 22px, all dropdown items = 24px).
- **Grid alignment**: items in a grid must have equal cell sizes and uniform gaps.
- **No accidental overlap**: check that close buttons, pins, and action icons don't overlap with content at any width.

---

## 9. Typography Consistency

- Verify font sizes follow the established scale: 7px (micro labels), 8px (sub-labels), 9px (default body/values), 10px (headers/buttons), 12px (window titles), 14px (large data).
- All numeric values use `fontVariantNumeric: "tabular-nums"`.
- Font family `'Exo 2', sans-serif` applied to all interactive elements (buttons, inputs, selects).
- No mixing of font weights within a single grouping — section headers all use the same weight.

---

## 10. Cursor States

- `cursor: pointer` on all clickable elements.
- `cursor: move` on draggable window headers.
- `cursor: text` on text inputs.
- `cursor: not-allowed` on disabled buttons.
- `cursor: ew-resize` / `ns-resize` on resize handles if any exist.
- `cursor: default` everywhere else (no random pointers on non-clickable areas).

---

## 11. Event Handling Hygiene

- All overlay/dropdown content must have `onClick={(e) => e.stopPropagation()}` to prevent click-through closing.
- All draggable window close buttons must have `onMouseDown={(e) => e.stopPropagation()}` to prevent drag interference.
- Outside clicks on the root container should close all open windows/dropdowns via `closeAll()`.
- Escape key should close the topmost open window.

---

## 12. Scrollable Areas

- Every scrollable container has the thin scrollbar class applied (`className="ind-scroll"`).
- Long lists (indicators, timezones) must scroll, not overflow.
- The scrollbar styles are defined in the global `<style>` tag — verify it's still present and unmodified.

---

## 13. Loading & Empty States

- Empty lists (no pinned items, no drawings, no positions) show a centered icon + brief description.
- Search inputs with no matches show "No results" centered, not just an empty space.

---

## 14. Final Checklist Before Sign-off

After applying all changes, manually verify:

- [ ] Every icon button has a tooltip or is universally understood
- [ ] No two windows can be open at the same time
- [ ] Every window can be dragged but stops at screen edges
- [ ] All dropdowns and popups stay within the viewport
- [ ] Color pickers without opacity slider are line/text/level controls
- [ ] Color pickers with opacity slider are background/space controls
- [ ] Section separators present where logical, absent where redundant
- [ ] All hover states feel consistent across the app
- [ ] All transitions are smooth (0.12-0.20s ease)
- [ ] No visual jank when switching tabs, opening windows, or hovering buttons
- [ ] Typography scale is consistent throughout
- [ ] No alignment is off by even 1px in panels and dialogs

---

Apply every fix in this review pass. Use best judgment based on the established Talaria design system — do not introduce new patterns. After completing, provide a summary of every change made, organized by section.
