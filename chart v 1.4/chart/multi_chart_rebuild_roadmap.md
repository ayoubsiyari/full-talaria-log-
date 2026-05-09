# Multi-Chart Multi-Timeframe Layout — Rebuild Roadmap

A step-by-step plan for rebuilding the multi-chart layout function in your charting tool. Each step has a clear goal, verification criteria, and a ready-to-use prompt for an AI coding agent.

---

## Background for context

The previous version of the multi-chart layout had a sync bug: when two charts were displayed with different timeframes, the lower-timeframe chart's price axis would inherit the higher-timeframe chart's range, causing candles to compress vertically. The root cause is almost certainly that sync was implemented as bundled state sharing — when chart A changed, chart B inherited too much of chart A's view state, including its price axis range.

This rebuild fixes the issue by:
- Defining an explicit allowlist of what is shared between synced charts
- Ensuring each chart owns its own price axis and never receives one from outside
- Building incrementally with verification at each step, instead of integrating everything at once

---

## How to use this document

Each step has three parts:

1. **Goal** — what you're building
2. **Verification** — how you confirm it works before moving on
3. **Agent prompt** — a copy-paste prompt for your AI coding agent

**Important rules:**

- Do not skip verification. The previous bug got hidden because too much was integrated at once. If a step's verification fails, fix it before moving to the next step.
- Test with mismatched timeframes from Phase 2 onward (e.g., 1-minute and 1-hour). The bug class only appears with mismatched timeframes — same-timeframe testing gives false confidence.
- Before each prompt, fill in the "Context for the agent" placeholders (your stack, file paths, etc.). Without that, the agent will guess.

---

## Phase 0 — Foundational decisions (no code yet)

These are design decisions you make before writing any sync code. Document them somewhere your dev can reference.

### Decision 1: Sync allowlist

The single most important document for this rebuild. Whatever's not on the SHARED list must be architecturally incapable of being shared, not just "we don't sync it currently."

**SHARED between synced charts:**
- Instrument / symbol
- Crosshair position (TIME COMPONENT ONLY — never price)
- Visible time range (with timeframe-aware bucket snapping)

**NOT SHARED — each chart owns independently:**
- Price axis range (min, max, auto-fit behavior)
- Price axis scale type (linear/log)
- Vertical zoom and position
- Timeframe selection
- Indicators on the chart
- Drawing tools / annotations
- Chart type (candlestick / line / bar)

### Decision 2: Canonical time format

Pick one and stick to it for the entire codebase. Recommended: **UTC Unix seconds (integer)**. All conversions to/from the FirstRate data feed and the charting engine go through this format.

### Decision 3: Snap-rounding rules for time sync

Write down what happens when the crosshair moves between mismatched timeframes:

- 1-minute chart crosshair at 14:23 -> 1-hour chart crosshair at: ___________ (recommended: the 14:00 candle)
- 1-hour chart crosshair at 14:00 candle -> 1-minute chart crosshair at: ___________ (decide: start of hour? center? last position within hour?)

Same for visible ranges (which have a start AND an end).

### Decision 4: Sync topology

With 3+ charts, are all charts peers (any change syncs to all others), or is there a designated master chart? Both work, but they need different implementations. Pick one.

---

## Phase 1 — Single chart foundation

### Step 1.1: Single chart in isolation

**Goal:** One chart that renders, scrolls horizontally, zooms, shows the crosshair, and auto-fits its price axis to visible candles. No layout system, no sync.

**Verification:**
- Chart renders with FirstRate data
- Pan horizontally — chart scrolls smoothly
- Zoom in/out — candles resize correctly
- Crosshair moves with the mouse
- Resize the browser window — price axis recomputes and candles still fit vertically
- No errors in the browser console

**Agent prompt:**

```
Context for the agent (fill in before using):
- Stack: [e.g., React 18 + TypeScript, or vanilla JS, or Vue 3]
- Charting engine: [your engine name and version, or "custom canvas-based engine"]
- Data source: FirstRate Data, accessed via [REST API / file / WebSocket — specify]
- Existing code location: [path to relevant files, or "starting from scratch"]

Task:
Build a single chart component that displays OHLC candlestick data from our FirstRate data source. The chart must:
1. Render candles with correct OHLC visualization
2. Support horizontal pan (mouse drag) and zoom (mouse wheel)
3. Show a crosshair that follows the mouse, with time and price displayed in the corner
4. Auto-fit its price axis (Y-axis min/max) to whatever candles are currently visible
5. Recompute the price axis when the container is resized
6. Use UTC Unix seconds (integer) as the canonical internal time format — convert to/from this format at every boundary (data load, user input, display)

Constraints:
- The chart must own its own state. Do not introduce any global state, shared store, or props that would later allow another chart to push values into this one.
- Do not add any sync hooks, callbacks, or event emitters yet. This is a standalone single chart.
- If the charting engine has a method to set the price axis range from outside, do not call it anywhere. The price axis must only be computed internally from visible candles.

Deliverables:
- The chart component
- A test page that loads it with hardcoded data
- A note explaining where the price axis recompute is triggered (so we can verify it later)
```

### Step 1.2: Document the chart engine's API

**Goal:** Know exactly what the engine emits and accepts, in what format. Future sync work depends on this.

**Verification:**
- A written document listing every event/callback the chart emits, with the exact data format
- Same for every method the chart accepts as input
- Specifically confirmed: is there a method that sets the price axis range from outside? If yes, it gets wrapped in a function that throws an error, so it can never be called accidentally.

**Agent prompt:**

```
Context for the agent (fill in before using):
- Charting engine: [your engine name]
- Code location: [path to the chart component built in Step 1.1]

Task:
Audit the charting engine's API as used by our chart component. Produce a markdown document with the following sections:

1. Events emitted by the chart
   For each event/callback (crosshair move, pan, zoom, etc.):
   - Event name
   - When it fires
   - Exact data payload format (with example values)
   - Whether the time format is Unix seconds, milliseconds, or something else

2. Methods accepted by the chart
   For each method that mutates chart state (set crosshair, set visible time range, set timeframe, etc.):
   - Method name
   - What it does
   - Exact input format
   - Whether it triggers any internal events as a side effect (this is critical for avoiding feedback loops)

3. Price-axis-related methods
   List every method or property that can affect the price axis (Y-axis) range from outside.
   For each one, wrap it in a guard function in our codebase that throws an error if called. Document the wrapper location.
   This is a deliberate constraint: the price axis must be computed by the chart from its own visible data, never set from outside.

Deliverables:
- The markdown document
- The guard wrappers (with tests that the throw works)
```

### Step 1.3: Add timeframe switching to the single chart

**Goal:** User can change the chart's timeframe (1m, 5m, 1h, 1d, etc.) and the price axis adapts correctly to the new range of candles.

**Verification:**
- Switch from 1m to 1h on the same chart — price axis range expands to fit the wider price span typical of an hourly chart
- Switch back to 1m — price axis range contracts to fit the tighter span
- No visual glitches, no console errors

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to chart component]
- Available timeframes for our data: [e.g., 1m, 5m, 15m, 1h, 4h, 1d]

Task:
Add a timeframe selector to the chart from Step 1.1. When the user selects a different timeframe:
1. The chart loads the appropriate dataset for that timeframe
2. The price axis auto-fits to the new visible candles (this should already be working from Step 1.1, but verify)
3. The visible time range is preserved as much as possible across timeframe changes (the same 24-hour window should remain visible whether each candle is 1m or 1h)

Constraints:
- Still no sync mechanism, no shared state with anything else
- Each timeframe loads its own data; don't try to derive higher timeframes by aggregating lower-timeframe candles unless that's already how our data engine works

Deliverables:
- The updated chart component with timeframe selector
- Verification: open the chart, switch through timeframes 1m -> 5m -> 1h -> 1d -> 1m, confirm the price axis adapts each time
```

---

## Phase 2 — Two independent charts (still no sync)

### Step 2.1: Two charts side by side, no communication

**Goal:** Two chart instances on the same page, totally independent. Different data, different timeframes, no shared state.

**Verification:**
- Pan chart A — chart B does not move
- Zoom chart A — chart B does not change
- Switch chart A's timeframe — chart B's timeframe is unchanged
- Resize the page — both charts independently recompute their own price axes
- No console errors, no warnings about shared state

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to chart component from Phase 1]
- Stack: [confirm React/Vue/vanilla]

Task:
Place two instances of our chart component on the same page, side by side. The two charts must be completely independent — interacting with one must not affect the other in any way.

Configuration for verification:
- Chart A: 1-minute timeframe, [symbol, e.g., AAPL]
- Chart B: 1-hour timeframe, same symbol

Constraints:
- Do not introduce any shared state, context provider, store, or event bus that both charts can access. Each chart instance has its own internal state, period.
- If the charting engine uses a global registry of chart instances, document this and ensure the two charts cannot read or modify each other's state through it.
- Do not add any sync code yet — this step is to verify isolation.

Deliverables:
- The page with two charts
- Manual test report: pan chart A, did chart B move? Zoom chart A, did chart B change? Switch chart A's timeframe, did chart B's change? All answers should be "no."
- If any answer was "yes," identify the source of the leak and fix it before proceeding.
```

---

## Phase 3 — Crosshair sync only

### Step 3.1: One-direction crosshair sync (A -> B)

**Goal:** When the user moves the crosshair on chart A, chart B's crosshair follows. Only the time component is sent. Chart B's price axis must not change.

**Verification:**
- Move crosshair on chart A — chart B's crosshair moves to the corresponding time
- Apply the snap rule: chart A at 14:23 (1m) -> chart B's crosshair at the 14:00 candle (1h)
- Critical: chart B's price axis range BEFORE and AFTER the crosshair sync is identical (log it to confirm)
- Chart B's other state (timeframe, visible range, zoom) is unchanged

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to two-chart page from Step 2.1]
- Snap rule: 1-minute crosshair at time T -> 1-hour crosshair at floor(T to nearest hour boundary)
- Canonical time format: UTC Unix seconds (integer)

Task:
Add ONE-WAY crosshair sync from chart A to chart B. When the user moves the crosshair on chart A:
1. Capture the time component only (do not capture price)
2. Apply the snap rule to convert chart A's time to chart B's bucket: floor(timeA / 3600) * 3600 (for 1h target)
3. Programmatically set chart B's crosshair to that snapped time
4. Chart B does not push any updates back to chart A in this step

Strict constraints:
- Only TIME is communicated between charts. The price component of chart A's crosshair must not be sent to chart B, and chart B must not use any price information when positioning its crosshair.
- Chart B's price axis must remain unchanged after this sync. Add an assertion or a console log: "Chart B price min/max before sync: X, Y. After sync: X, Y." If the values differ, the sync is leaking — find and remove the leak.
- Use the API methods documented in Step 1.2. Do not call any method that affects chart B's price axis or visible range — only the crosshair-set method.

Deliverables:
- The crosshair sync code
- Logs confirming chart B's price axis is identical before/after each sync event
- Manual test: move crosshair on chart A across 30+ minutes of data; confirm chart B's crosshair follows correctly with snap to the hour bucket; confirm chart B's price axis never moves
```

### Step 3.2: Add reverse direction (B -> A) with feedback-loop guard

**Goal:** Bidirectional crosshair sync. Moving the crosshair on either chart updates the other. No infinite loops.

**Verification:**
- Move crosshair on A — B updates exactly once (verify in logs)
- Move crosshair on B — A updates exactly once
- Rapid back-and-forth movement — no cascading events, no stack overflow, no oscillation
- Both charts' price axes still unchanged through every event

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to one-way sync from Step 3.1]
- Reverse snap rule: 1-hour crosshair at hour boundary T -> 1-minute crosshair at: [decide: start of hour T, or last known minute position within hour T]

Task:
Add reverse crosshair sync from chart B to chart A, AND a feedback-loop guard so that programmatic crosshair updates do not trigger further sync events.

Implementation guidance:
- When sync code programmatically sets a chart's crosshair, that chart will fire its own crosshair-changed event. We must distinguish between user-initiated events and sync-initiated events to avoid loops.
- Common patterns: a "syncing" boolean flag set during the programmatic update, an event-source field on the event payload, or skipping the next event after a programmatic set. Pick one and document why.

Strict constraints:
- The same NEVER-SHARE rules from Step 3.1: only time, never price. Verify chart B's price axis is unchanged after a B-to-A sync (which fires when chart B's crosshair is moved by the A-to-B sync — this is exactly where loops occur).
- Add logging: every crosshair event logs "user-initiated" or "sync-initiated" and the time value. After each user movement, the log should show 1 user event and 1 sync event total — not a cascade.

Deliverables:
- Bidirectional crosshair sync with loop guard
- Log analysis: 10 user crosshair movements should produce exactly 20 log entries (10 user + 10 sync), not more
- Stress test: rapid mouse movement on both charts simultaneously for 30 seconds; confirm no infinite loops, no console errors, no oscillation
```

---

## Phase 4 — Visible time range sync (the high-risk phase)

### Step 4.1: One-direction visible range sync (A -> B)

**Goal:** When the user pans or zooms chart A horizontally, chart B's visible time range follows. Chart B's price axis must independently auto-fit to whatever candles are now visible on chart B.

**Verification:**
- Pan chart A — chart B shows the corresponding time range
- Chart B's price axis auto-fits to chart B's own visible candles. Critical test: pan chart A to a region where the price has moved significantly; chart B's price min/max must reflect chart B's now-visible candles, not chart A's.
- Log chart B's price range before and after each sync event. Confirm it changes correctly based on chart B's own data.

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to crosshair sync from Step 3.2]
- Canonical time format: UTC Unix seconds
- Snap rule for visible ranges: when chart A (1m) shows time range [start_A, end_A], chart B (1h) should show range [floor(start_A to hour), ceil(end_A to hour)]

Task:
Add ONE-WAY visible-time-range sync from chart A to chart B. When the user pans or zooms chart A:
1. Capture chart A's new visible time range as (start_time, end_time) in Unix seconds
2. Apply the snap rule to align to chart B's bucket boundaries
3. Programmatically set chart B's visible time range to the snapped range
4. Critically: do NOT communicate any price-axis information. Chart B's price axis must auto-fit to its own visible candles after the time range changes.

Strict constraints:
- Only TIME is sent. Never a price range, never a Y-axis configuration, never anything price-related.
- After chart B's visible time range is set, verify chart B's price axis recomputes from its own visible candles. If chart B's price axis appears to inherit chart A's price range — STOP, this is the original bug class. Find what's leaking.
- This step likely requires the chart to expose a "set visible time range" method that accepts (start, end) and triggers an internal price axis recompute. If your engine doesn't auto-recompute the price axis when the visible range changes via this method, you must explicitly call the price-axis-recompute method afterward — but never with values from outside the chart, only "auto-fit to current visible candles."

Deliverables:
- The visible range sync code
- Log analysis: for each pan event on chart A, log: chart A's new range, chart B's new range (after snap), chart B's old price min/max, chart B's new price min/max. Verify chart B's price min/max reflects its own visible candles, not chart A's.
- Manual test: pan chart A across a region where the underlying price changes by more than 10%. Chart B (lower timeframe) should show its candles at full vertical scale, NOT compressed. If candles compress, the bug is back — debug at this step before proceeding.
```

### Step 4.2: Add reverse direction (B -> A) with loop guard

**Goal:** Bidirectional visible range sync. Loop-safe.

**Verification:**
- Pan chart B — chart A's range updates with appropriate snap (hour-aligned)
- Both charts' price axes auto-fit to their own visible candles
- No cascading events, no oscillation under rapid pan/zoom on both charts

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to one-way visible range sync from Step 4.1]

Task:
Add reverse visible-time-range sync from chart B to chart A, with a feedback-loop guard equivalent to the one in Step 3.2.

Strict constraints:
- Same NEVER-SHARE rules: only time range, never price range
- After every sync event, verify both charts' price axes auto-fit to their own visible candles
- The loop guard from Step 3.2 must extend to visible range events too. Programmatic time range changes on either chart must not trigger further sync events.

Deliverables:
- Bidirectional visible range sync with loop guard
- Stress test: rapid pan and zoom on both charts simultaneously for 30 seconds. No console errors, no infinite loops, both price axes always reflect their own visible candles.
- Specific test for the original bug: leave chart A on 1-hour timeframe, chart B on 1-minute. Pan chart A across a multi-day window. Chart B's candles must NOT compress vertically. Chart B's price axis must reflect the prices visible in its own (now larger) time window, not chart A's.
```

---

## Phase 5 — Layout system

### Step 5.1: Introduce the layout container

**Goal:** Two charts inside a layout container (grid, split-pane, whatever your design uses) instead of fixed positions.

**Verification:**
- Charts render correctly inside the layout
- Resize the divider between panes — each chart's price axis recomputes from its own visible candles. Critical: this is a separate failure mode from sync, and a likely contributor to the original bug
- All sync from Phase 3 and Phase 4 still works after layout changes

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to bidirectional sync from Step 4.2]
- Layout system: [e.g., react-resizable-panels, golden-layout, custom CSS grid — specify]

Task:
Wrap the two charts in our layout container. The user must be able to resize the panes between charts. Charts must continue to function and stay synced after layout operations.

Critical requirement:
- When a chart's container resizes (because the user moved the divider), the chart must recompute its price axis to fit its visible candles. If the charting engine doesn't do this automatically on resize, hook into the resize observer and trigger a price-axis-fit explicitly.
- This is the most likely cause of "candles compressed vertically" symptoms when no sync is involved — the chart's container changes size but the chart doesn't know to reflow its axes.

Constraints:
- Do not add the ability to dynamically add or remove charts yet. Two charts only, in fixed slots within the layout.
- All sync behavior from Phase 4 must continue to work after every layout operation. Verify this explicitly: resize a pane, then pan/zoom — sync still functions, no console errors.

Deliverables:
- Two charts inside the layout container
- Manual test: drag the divider between panes; both charts adapt their price axes correctly. Then pan and zoom on each chart; sync still works.
- Verification that the chart's resize observer fires correctly and triggers a price-axis recompute. Add a console log to confirm.
```

### Step 5.2: Three or more charts with full sync topology

**Goal:** User can have 3+ charts in the layout. Sync follows the topology decision from Phase 0.

**Verification:**
- Add a third chart at a third timeframe (e.g., 5m alongside the existing 1m and 1h)
- Move the crosshair on each in turn — the other two follow
- Pan/zoom on each in turn — the others follow
- All three charts' price axes always auto-fit to their own visible candles
- No infinite loops, no oscillation under rapid input on all three

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to layout from Step 5.1]
- Sync topology: [PEER (any chart's change syncs to all others) or MASTER (one designated master chart drives the others)]

Task:
Extend the multi-chart layout to support 3+ charts with the chosen sync topology.

If PEER topology:
- Any chart's user-initiated event syncs to all other charts
- The feedback-loop guard must extend to N charts, not just 2 — when chart A's event triggers updates to charts B and C, neither B nor C should re-emit further sync events
- Use a single shared "currently-syncing" guard or an event-source identifier that all charts respect

If MASTER topology:
- Only the designated master chart's user events trigger sync to others
- Non-master charts' user events do not propagate
- Switching which chart is master is a separate UI action

Constraints:
- Add a 3rd chart at a 3rd timeframe (e.g., 1m + 5m + 1h) for verification
- Continue to enforce: only time and crosshair sync, never price; each chart owns its own price axis
- Verify under stress (rapid input on all charts) no infinite loops occur

Deliverables:
- Multi-chart sync supporting 3+ charts
- Stress test results: all three charts respond correctly to user input on any of them, no oscillation
- Specific test for original bug class: with 1m + 1h charts, pan the 1h chart across a wide range. The 1m chart's candles must not compress vertically. Its price axis must reflect prices in its own visible window.
```

---

## Phase 6 — Edge cases (do these before declaring done)

### Step 6.1: Data gaps (weekends, market closures)

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to multi-chart layout from Step 5.2]
- Data source: FirstRate Data — typically has gaps for weekends and market closures

Task:
Verify that sync behavior correctly handles data gaps. With a 1-minute and 1-hour chart synced:
1. Pan to a Friday afternoon -> Monday morning region
2. Confirm both charts handle the gap visually (no broken candles, no infinite scroll)
3. Confirm the snap rule still works at gap boundaries
4. Confirm price axes still auto-fit when the visible range includes a gap

If any of these fail, document the failure mode and fix.

Deliverables:
- Test report covering at least one weekend gap and one market closure (holiday)
- Any fixes needed
```

### Step 6.2: Timeframe switching while synced

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to multi-chart layout]

Task:
Verify that switching a chart's timeframe while it's synced with other charts does not break sync.

Test scenarios:
1. Two charts (1m and 1h) are synced. Change the 1m chart to 15m. Confirm sync continues to work between 15m and 1h.
2. Same setup. Change the 1m chart back to 1m. Confirm sync still works.
3. Both charts at 1h. Change one to 1m. Confirm sync still works at the new mismatch.

For each scenario, confirm:
- No console errors during the timeframe switch
- Sync continues to work after the switch
- Price axes on both charts remain correctly auto-fitted to their own visible candles

Deliverables:
- Test report
- Any fixes needed
```

### Step 6.3: Adding/removing charts in a synced layout

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to multi-chart layout]

Task:
Verify that adding and removing charts from a synced layout works cleanly without leaving stale event listeners.

Test scenarios:
1. Three synced charts. Close the middle chart. Confirm the remaining two continue to sync correctly.
2. Two synced charts. Add a third. Confirm all three sync correctly.
3. Repeat add/remove 5 times. Confirm no memory leak (check browser dev tools heap snapshot — chart instances should be garbage collected).
4. After removing a chart, pan/zoom the remaining ones; the removed chart's listeners should not fire any handlers.

Deliverables:
- Test report
- Heap snapshot before/after add-remove cycles showing no orphaned chart instances
- Any fixes needed
```

### Step 6.4: Browser refresh and state restore

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to multi-chart layout]
- Persistence mechanism: [localStorage, backend, none — specify]

Task:
If the layout state persists across browser refreshes, verify that sync is correctly re-established after restore.

Test scenarios:
1. Set up two synced charts at different timeframes. Refresh the browser.
2. Confirm both charts re-render with their correct timeframes and visible ranges.
3. Confirm sync still works after the refresh.
4. Critically: confirm each chart's price axis is recomputed from its own visible candles, NOT restored from a saved value. If price axes are persisted, this would reintroduce the original bug class.

Deliverables:
- Test report
- Confirmation that persisted state contains only: instrument, timeframe, visible time range — and explicitly NOT price axis ranges
- Any fixes needed
```

### Step 6.5: Performance under throttled CPU

**Agent prompt:**

```
Context for the agent (fill in before using):
- Code location: [path to multi-chart layout]

Task:
Verify that the sync mechanism remains correct under load. Race conditions in event handlers often only show up when CPU is constrained.

Test scenarios:
1. Open browser dev tools. Set CPU throttle to 4x slowdown.
2. Open three synced charts.
3. Pan rapidly on chart A for 30 seconds.
4. Confirm: charts B and C track correctly without falling behind, no console errors, no infinite loops.
5. Repeat with rapid input on all three charts simultaneously.

Deliverables:
- Performance test report
- Any fixes needed for race conditions exposed by throttling
```

---

## Final checklist before declaring done

Before considering the multi-chart layout complete, confirm all of the following:

- The sync allowlist document exists and matches the implemented behavior exactly
- No code path anywhere sets a chart's price axis from outside (the guards from Step 1.2 still exist and have never been removed or bypassed)
- Each chart's price axis is recomputed when: visible time range changes, container is resized, timeframe changes
- Crosshair sync sends only time, never price
- Visible range sync sends only time range, never price range
- Feedback loop guards work correctly under stress (rapid input on multiple charts)
- All edge cases from Phase 6 pass
- The original bug symptom is verified absent: with mismatched timeframes, panning the higher-timeframe chart does not compress the lower-timeframe chart's candles vertically

If any item fails, do not declare done. Identify the regression and fix at the earliest phase where the verification was met, then re-verify all subsequent phases.

---

## Documents to maintain alongside the code

These documents make future debugging much easier. Keep them up to date as the code evolves.

1. **Sync allowlist** (Phase 0, Decision 1) — the contract for what is and isn't shared
2. **Canonical time format** (Phase 0, Decision 2) — what format times are in, where conversions happen
3. **Snap-rounding rules** (Phase 0, Decision 3) — how time mismatches are resolved
4. **Sync topology** (Phase 0, Decision 4) — peer vs master
5. **Charting engine API audit** (Step 1.2) — what the engine emits and accepts, with format details
6. **Price-axis guard documentation** (Step 1.2) — list of methods that are wrapped to prevent external price-axis manipulation

If a future change breaks something, these documents make it much easier to find what assumption was violated.
