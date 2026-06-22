#!/usr/bin/env py -3
"""Generate Dashboard UAT tracker: Strategies, Sessions, Trades, Sources."""

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent / "Talaria-Dashboard-QA-Tracker.xlsx"
RESULT_LIST = '"☑ Pass,☐ Fail,⚠ Partial,— Not tested"'
ISSUE_LIST = '"☑ Yes,☐ No,— Not tested"'


def step(section, phase_num, phase_name, instruction, expected, priority="P1"):
    return {
        "section": section,
        "phase_num": phase_num,
        "phase_name": phase_name,
        "instruction": instruction,
        "expected": expected,
        "priority": priority,
    }


# ─── Build all steps in user order ───────────────────────────────────────────

STEPS = []

def add(section, phase_num, phase_name, items):
    for instr, expected, *rest in items:
        pri = rest[0] if rest else "P1"
        STEPS.append(step(section, phase_num, phase_name, instr, expected, pri))


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1 — STRATEGIES PAGE & STRATEGY BUILDER
# ═══════════════════════════════════════════════════════════════════════════

add("1 — Strategies", 1, "Navigate to Strategy Bank", [
    ("Log in and open the dashboard at /dashboard/.", "Dashboard loads without errors.", "P0"),
    ("Click **Strategies** in the left navigation panel.", "Strategy Bank page opens; title shows “Strategy Bank”.", "P0"),
    ("Confirm URL contains view=stratbank (or /dashboard/strategies redirects).", "Correct strategies view is active.", "P2"),
    ("Verify left nav highlights Strategies while on this page.", "Strategies nav item is visually active.", "P2"),
    ("Click each other nav item (Dashboard, Trades, Backtest) then return to Strategies.", "Navigation works both ways.", "P1"),
])

add("1 — Strategies", 2, "Strategy Bank — Page Controls", [
    ("Locate the **Build Strategy** button in the page header.", "Button is visible and clickable.", "P0"),
    ("Confirm tabs: **My Strategies** (active) and **Community** (grayed/disabled).", "Community tab cannot be used or is clearly disabled.", "P1"),
    ("Try clicking the Community tab.", "Tab does not switch or shows disabled state.", "P2"),
    ("Toggle layout view: **Cards** vs **Rows**.", "Strategy list switches layout; all cards/rows still readable.", "P1"),
    ("Type in the **search** box (e.g. part of a strategy name).", "List filters to matching strategies only.", "P1"),
    ("Clear search using the × button or delete all text.", "Full list returns.", "P1"),
    ("With no strategies (or cleared search), check empty state message.", "Empty state shows with CTA to Build Strategy.", "P2"),
    ("Search for text that matches no strategy.", "“No results” or equivalent message appears.", "P2"),
])

add("1 — Strategies", 3, "Strategy Bank — Cards, Rows & Actions", [
    ("In **Cards** view: verify each card shows name, description, markets, timeframes, tags.", "All fields render without truncation bugs.", "P1"),
    ("Verify backtest stats on card: sessions count, P&L, win rate (or — if none).", "Stats match linked sessions or show placeholders.", "P1"),
    ("Hover a strategy card.", "Card highlights on hover.", "P2"),
    ("**Double-click** your own strategy card.", "Strategy Builder opens in **Edit** mode with saved data.", "P0"),
    ("Click the **⋯** menu on a strategy card.", "Menu opens: New Session, Dashboard, Edit, Copy, Delete (as applicable).", "P0"),
    ("From ⋯ menu choose **New Session**.", "Add Session window opens with strategy name/description pre-filled.", "P0"),
    ("From ⋯ menu choose **Dashboard**.", "Performance dashboard for that strategy opens.", "P1"),
    ("From ⋯ menu choose **Edit**.", "Strategy Builder opens with existing data.", "P0"),
    ("From ⋯ menu choose **Copy**.", "Duplicate appears in My Strategies as “(copy)” or “(copy N)”.", "P1"),
    ("From ⋯ menu choose **Delete** → confirm.", "Strategy removed from list.", "P1"),
    ("Switch to **Rows** view; repeat ⋯ menu on a row.", "Same actions work in row layout.", "P1"),
    ("Double-click a **template preview** card (if shown).", "Opens builder from template with pre-filled flow.", "P2"),
])

add("1 — Strategies", 4, "Template Picker & New Strategy", [
    ("Click **Build Strategy**.", "Template Picker opens (unless previously dismissed forever).", "P0"),
    ("Browse template list; read template name and description.", "Templates display correctly.", "P1"),
    ("Select a template → confirm/use.", "Strategy Builder opens at Step 1 with template data.", "P0"),
    ("Close builder; click Build Strategy again → skip/cancel template picker.", "Blank builder opens OR picker dismiss option works.", "P1"),
    ("If “don’t show again” exists, test it and rebuild.", "Picker behavior matches setting after reload.", "P2"),
])

add("1 — Strategies", 5, "Strategy Builder — Shell & Navigation", [
    ("Open Strategy Builder (new or edit).", "Modal opens full-screen style; backdrop visible.", "P0"),
    ("Verify wizard header shows 4 steps: General Info, Strategy Flow, Trade Tags, Review.", "All four step labels visible.", "P0"),
    ("Click **×** close button.", "Modal closes; no data loss prompt if nothing changed (note behavior).", "P1"),
    ("Click backdrop outside modal.", "Modal should NOT close (by design) — only × closes.", "P2"),
    ("Click **TEMPLATES** button in header.", "Template picker re-opens.", "P1"),
    ("On Step 1, click Step 3 tab directly.", "Should block or force back to Step 1 if required fields empty.", "P0"),
    ("Fill required Step 1 fields, then click Step 4.", "Can jump ahead when Step 1 complete.", "P1"),
    ("Click **Back** on Step 2.", "Returns to Step 1 with data preserved.", "P1"),
    ("Click **Next** through all steps.", "Steps advance 1→2→3→4.", "P0"),
])

add("1 — Strategies", 6, "Builder Step 1 — General Info (every field)", [
    ("**Strategy name** — leave empty, click Next.", "Red hint appears; cannot proceed; lists missing: name, markets, timeframes.", "P0"),
    ("Enter strategy name (max 80 chars).", "Name accepts input; character limit enforced if exceeded.", "P0"),
    ("**Emoji / icon picker** — select an emoji.", "Icon updates on card preview areas.", "P2"),
    ("**Description** — type text; check character counter (500 max).", "Counter updates; long text truncates or blocks at limit.", "P1"),
    ("**Tags** — select from dropdown presets.", "Tags appear as chips/pills.", "P1"),
    ("**Tags** — add a custom tag.", "Custom tag added to list.", "P1"),
    ("**Markets** — select at least one market category (required).", "Selected markets show as active; required for Next.", "P0"),
    ("Deselect all markets.", "Next blocked with “markets” in missing list.", "P0"),
    ("**Instruments** — pick specific symbols if field exists.", "Instruments save with strategy.", "P1"),
    ("**Supporting instruments** — add secondary symbols.", "Supporting list populates.", "P2"),
    ("**Timeframes** — select at least one (required).", "TF chips active; required for Next.", "P0"),
    ("Add a **custom timeframe** if option exists.", "Custom TF appears in selection.", "P2"),
    ("**Strategy image** — upload an image file.", "Image preview shows; save includes image.", "P2"),
    ("Complete name + markets + timeframes → click **Next**.", "Advances to Step 2 without errors.", "P0"),
])

add("1 — Strategies", 7, "Builder Step 2 — Strategy Flow Canvas", [
    ("On Step 2, locate the visual **canvas** workspace.", "Canvas renders with grid/background.", "P0"),
    ("Open the **palette** (left panel) — list condition/group types.", "Palette items visible and clickable.", "P0"),
    ("Add a **group** to the canvas.", "Group node appears on canvas.", "P0"),
    ("Add a **condition** inside a group.", "Condition node appears; linked to group.", "P0"),
    ("Set condition status: **Mandatory**, **Optional**, or **Invalidate**.", "Status badge/color updates on node.", "P1"),
    ("Connect nodes with **edges** if flow connections supported.", "Lines/arrows connect nodes.", "P1"),
    ("Select a node → open **inspector** (right panel).", "Inspector shows editable fields for selected node.", "P0"),
    ("Edit condition text/title in inspector.", "Canvas label updates.", "P1"),
    ("Collapse/expand **minimap** if toggle exists.", "Minimap hides/shows.", "P2"),
    ("Collapse **palette** or **inspector** if toggles exist.", "Panels collapse without breaking canvas.", "P2"),
    ("Use **undo** if available after adding nodes.", "Last action reverses.", "P2"),
    ("Use **print/export flow** if toolbar button exists.", "Print preview or export opens.", "P2"),
    ("Delete a node (keyboard Delete or context action).", "Node removed from canvas.", "P1"),
    ("Click **Next** to Step 3.", "Flow data preserved.", "P0"),
])

add("1 — Strategies", 8, "Builder Step 3 — Trade Tags", [
    ("On Step 3, locate **Pre-trade tags** section.", "Pre-trade tag list/editor visible.", "P0"),
    ("Add a new **pre-trade tag** (name + type if applicable).", "Tag appears in list.", "P0"),
    ("Add **post-trade tag**.", "Post-trade tag appears.", "P0"),
    ("Add a **divider** between tag groups if supported.", "Divider renders in tag list.", "P2"),
    ("Edit an existing tag label.", "Change saves in UI.", "P1"),
    ("Delete a tag.", "Tag removed.", "P1"),
    ("Configure **variable types** for tags if options exist (checkbox, number, text).", "Variable type saves correctly.", "P1"),
    ("Click **Next** to Review.", "Tags preserved on Step 4.", "P0"),
])

add("1 — Strategies", 9, "Builder Step 4 — Review & Save", [
    ("On Step 4, verify **General Info** summary block.", "Shows name, markets, timeframes, description.", "P0"),
    ("Verify **Strategy Flow** summary: group count, condition count.", "Counts match what you built in Step 2.", "P0"),
    ("Verify **Trade Tags** summary.", "Pre/post tags listed.", "P1"),
    ("Check **readiness checklist** items (green/red).", "Incomplete items flagged.", "P1"),
    ("Check **linked backtest sessions** section if strategy has sessions.", "Sessions listed or empty state shown.", "P2"),
    ("Click **Save Strategy** with valid name.", "Saves successfully; modal closes; strategy appears in My Strategies.", "P0"),
    ("Re-open saved strategy — verify all 4 steps retain data.", "Full round-trip persistence.", "P0"),
    ("Try Save with empty name (if reachable).", "Save button disabled or error shown.", "P1"),
    ("If save fails (network), verify error message displays.", "saveError text visible; data not lost.", "P2"),
])

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2 — SESSIONS PAGE & ADD SESSION WINDOW
# ═══════════════════════════════════════════════════════════════════════════

add("2 — Sessions", 10, "Navigate to Sessions Page", [
    ("Click **Backtest** in left navigation.", "Backtesting Sessions page opens.", "P0"),
    ("Verify header: logo, “Talaria-Log”, subtitle “Backtesting Sessions”.", "Header renders correctly.", "P1"),
    ("Locate **New Session** button (top right, blue).", "Button visible.", "P0"),
])

add("2 — Sessions", 11, "Sessions — Stats Dashboard", [
    ("Review **Sessions & Mode** tile: Standard, Prop Firm, Journal counts.", "Counts match your session list.", "P1"),
    ("Review **Total Trades** bar chart; hover a bar.", "Tooltip shows session name, trades, mode, strategy.", "P1"),
    ("Review **Profitable Sessions %** arc/chart.", "Percentage calculates from sessions with P&L.", "P2"),
    ("Review **Days Tested** metric.", "Reasonable total days across sessions.", "P2"),
    ("Review **Tickers Tested** metric.", "Unique ticker count displayed.", "P2"),
])

add("2 — Sessions", 12, "Sessions — Filters, Search, Sort", [
    ("Click filter tab **All**.", "Shows every session; badge count correct.", "P0"),
    ("Click **Not Started**.", "Only progress=0 sessions shown.", "P1"),
    ("Click **Active**.", "Only in-progress sessions shown.", "P1"),
    ("Click **Completed**.", "Only finished sessions shown.", "P1"),
    ("Click **Standard**.", "Only standard backtest sessions.", "P1"),
    ("Click **Prop Firm**.", "Only prop mode sessions.", "P1"),
    ("Click **Journal**.", "Only journal sessions shown.", "P1"),
    ("Toggle **Cards** vs **Rows** layout.", "Layout switches; data consistent.", "P1"),
    ("In Cards view: change **sort** dropdown (Name, Strategy, Date Range, Balance, Net P&L, Win Rate, Avg R:R, Trades, Progress).", "List re-orders correctly.", "P1"),
    ("Toggle sort **ascending/descending**.", "Order reverses.", "P1"),
    ("In Rows view: click column headers to sort.", "Column sort works.", "P1"),
    ("Type in **search** box (session name, strategy, ticker).", "List filters live.", "P1"),
    ("Press **Escape** in search.", "Search clears (if implemented).", "P2"),
    ("Empty search with no sessions: verify **Create New Session** CTA.", "Empty state displays.", "P2"),
])

add("2 — Sessions", 13, "Sessions — Card/Row Content & Actions", [
    ("On a session card: verify name, created date, strategy name.", "Fields display correctly.", "P0"),
    ("Click **(i)** info icon next to strategy name.", "Strategy description tooltip/popup appears.", "P2"),
    ("Verify mode badge: Standard / Prop Firm / Journal colors.", "Correct color per mode.", "P1"),
    ("Verify asset class, symbols, date range timeline.", "Date range bar or text correct.", "P1"),
    ("Verify options chips: Rollback on/off, Costs on/off.", "Match session settings.", "P2"),
    ("Verify stats: Balance, P&L, Win %, R:R, Trades, Progress bar.", "Numbers reasonable vs session state.", "P0"),
    ("Click **Resume (▶)** on not-started or active session.", "Chart/backtest or journal opens.", "P0"),
    ("Click **Dashboard (grid)** icon.", "Session performance dashboard opens.", "P1"),
    ("Open **⋯** menu on a **not-started** backtest session.", "Start, Dashboard, Edit, Duplicate, Delete available.", "P0"),
    ("Choose **Edit** on not-started session.", "Add Session modal opens in edit mode with pre-filled fields.", "P0"),
    ("Choose **Edit** on **started** session (progress > 0).", "Edit is **disabled** with explanation.", "P0"),
    ("Choose **Duplicate**.", "New session copy created.", "P1"),
    ("Choose **Delete** → confirm.", "Session removed from list.", "P1"),
    ("On **Journal** session ⋯ menu: Trades, Add Trade, Dashboard, Edit Journal, Delete.", "Journal-specific actions present.", "P1"),
])

add("2 — Sessions", 14, "New Session — Kind Picker (Backtest vs Journal)", [
    ("Click **New Session**.", "Step 1 picker opens: Backtest vs Journal.", "P0"),
    ("Choose **Backtest**.", "Backtest New Session modal opens.", "P0"),
    ("Close modal; New Session → choose **Journal**.", "Journal type step opens (Real account / Prop firm).", "P1"),
    ("Select **Real account** or **Prop firm**.", "Proceeds to Add trades method step.", "P1"),
    ("On Add trades step: **Manual trades**.", "Option selectable (works).", "P1"),
    ("Verify **CSV import** shows Coming Soon (if labeled).", "Cannot proceed or shows disabled.", "P2"),
    ("Verify **Link with broker** shows Coming Soon.", "Cannot proceed or shows disabled.", "P2"),
])

add("2 — Sessions", 15, "Add Session Modal — Session Info", [
    ("Open new Backtest session modal.", "Modal title indicates new session.", "P0"),
    ("**Session name** — leave empty; check Save/Start disabled.", "Buttons disabled until required fields filled.", "P0"),
    ("Enter session name.", "Name field accepts text.", "P0"),
    ("**Strategy** dropdown — open list.", "Shows My Strategies + None option.", "P0"),
    ("Select a strategy.", "Strategy name applies to session.", "P0"),
    ("Click **New Strategy** shortcut in dropdown.", "Navigates to Strategies create flow.", "P2"),
    ("**Description** — enter text.", "Description saves with session.", "P1"),
])

add("2 — Sessions", 16, "Add Session Modal — Settings & Symbols", [
    ("**Trading mode** — switch Standard ↔ Prop Firm.", "Prop section appears when Prop selected.", "P0"),
    ("**Asset class** dropdown — select Forex, Futures, Stocks, Crypto, etc.", "Symbol list updates per asset class.", "P0"),
    ("**Primary symbol(s)** — add ticker via search/picker.", "At least one symbol required; chip appears.", "P0"),
    ("Remove a ticker chip.", "Symbol removed from list.", "P1"),
    ("**Timeframe** — select (e.g. 1H, 15m, 1D).", "TF saves.", "P0"),
    ("Enable **supporting tickers** — add secondary symbols.", "Supporting symbols list populates.", "P2"),
    ("**Replay mode** — Candle vs Tick.", "Selection toggles.", "P1"),
    ("**Replay speed** slider.", "Speed value changes.", "P1"),
    ("**Rollback** toggle on/off.", "Setting saves.", "P1"),
    ("**MFE/MAE tracking** toggle + hours/candles window.", "Fields enable/disable together.", "P2"),
    ("**Post-exit window** — hours vs candles mode.", "Mode switch works.", "P2"),
    ("**Timezone** + **DST** toggles.", "Timezone list selectable.", "P1"),
    ("**Advanced order** toggle.", "Enables advanced order options for session.", "P2"),
])

add("2 — Sessions", 17, "Add Session Modal — Date Range", [
    ("**Date mode** — Date range vs N-bars (if both exist).", "UI switches between modes.", "P1"),
    ("Open **calendar** for start date — pick a date.", "Start date field populates.", "P0"),
    ("Open calendar for **end date** — pick after start.", "End date populates.", "P0"),
    ("Use **quick date presets** (e.g. 1Y, 6M, YTD).", "Range auto-fills.", "P1"),
    ("Type dates manually in start/end inputs.", "Manual entry parses correctly.", "P2"),
    ("Set end before start.", "Validation error or auto-correct.", "P1"),
    ("N-bars mode: enter bar count.", "Session uses last N bars.", "P2"),
])

add("2 — Sessions", 18, "Add Session Modal — Account & Costs", [
    ("**Starting capital** — enter amount (required).", "Field accepts numbers.", "P0"),
    ("**Currency** dropdown — USD, EUR, etc.", "Currency flag/icon updates.", "P1"),
    ("**Risk mode** — % vs fixed $.", "Risk input label changes.", "P1"),
    ("**Risk value** — enter 1% or dollar amount.", "Value saves.", "P1"),
    ("**Leverage** — select or type (e.g. 1:100).", "Leverage saves.", "P1"),
    ("**Commission** type — none / per lot / etc.", "Commission value field enables.", "P1"),
    ("**Commission value** — enter e.g. 3.50.", "Value saves.", "P1"),
    ("**Slippage** — enter ticks/pips.", "Value saves.", "P2"),
    ("**Spread** per symbol if exposed.", "Spread saves.", "P2"),
    ("**Margin call** / **Stop out** levels if shown.", "Values editable.", "P2"),
    ("**Data files** — open file picker; link CSV dataset.", "File attaches to session.", "P2"),
])

add("2 — Sessions", 19, "Add Session Modal — Prop Firm Rules", [
    ("Set trading mode to **Prop Firm**.", "Prop Firm section expands.", "P0"),
    ("**Firm preset** — select FTMO or other.", "Preset fills default rule values.", "P1"),
    ("**Challenge type** — Evaluation / Funded.", "Selection saves.", "P1"),
    ("**Number of phases** — 1 or 2.", "Phase 2 fields appear when 2 selected.", "P1"),
    ("Phase 1: **Daily loss %**, **Max DD %**, **Profit target %**.", "Each field editable.", "P0"),
    ("Phase 1: **Min trading days** toggle + value.", "Toggle enables/disables day count.", "P1"),
    ("Phase 2: repeat loss/DD/target/min days if 2 phases.", "Phase 2 fields work independently.", "P1"),
    ("**Trailing drawdown** toggle.", "Setting saves.", "P1"),
    ("**Consistency rule** toggle + %.", "Fields work together.", "P2"),
    ("**Weekend holding** allowed toggle.", "Saves.", "P2"),
    ("**Max contracts/lots** toggle + value.", "Saves.", "P2"),
])

add("2 — Sessions", 20, "Add Session Modal — Save, Start & Limits", [
    ("Fill all required fields; click **Save** (without launch).", "Session created; appears in list as Not Started.", "P0"),
    ("Create another session; click **Start Session**.", "Session saves and redirects to chart/backtest.", "P0"),
    ("Leave required field empty — verify Save/Start stay disabled.", "Cannot submit incomplete form.", "P0"),
    ("If at plan session cap, try creating another.", "Session limit modal appears with upgrade message.", "P1"),
    ("Edit a not-started session via list ⋯ → Edit; change name; Save.", "Changes persist.", "P0"),
])

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3 — TRADES PAGE & ADD TRADES WINDOW
# ═══════════════════════════════════════════════════════════════════════════

add("3 — Trades", 21, "Navigate to Trades Page", [
    ("Click **Trades** in left navigation.", "Trades page opens with trade table.", "P0"),
    ("Verify **source switcher** in header shows current applied source.", "Label matches active source or “select source”.", "P0"),
])

add("3 — Trades", 22, "Trades Page — Header Controls", [
    ("Click **source switcher**.", "Sources library opens (or source picker).", "P0"),
    ("Open **Filters**.", "Filters panel/window opens with date, scope, tags, outcome options.", "P0"),
    ("Apply a date range filter.", "Table shows only trades in range.", "P1"),
    ("Clear filters.", "Full trade list returns.", "P1"),
    ("Enable **Compare mode** (if button exists).", "Compare source picker opens.", "P1"),
    ("Click **Import** — select a CSV file.", "Import runs; success or error message; table updates.", "P1"),
    ("Click **Export** with trades present.", "CSV file downloads.", "P1"),
    ("Click **Export** with zero trades.", "Button disabled or message shown.", "P2"),
    ("Click **Add Trade**.", "Source picker opens (or editor if single source).", "P0"),
])

add("3 — Trades", 23, "Trades Table — Columns & Sorting", [
    ("Verify default columns: Trade ID, Source, Date, Symbol, Side, Qty, Status, Net P&L, R, etc.", "Columns render with data.", "P0"),
    ("Open **column picker** — toggle optional columns.", "Columns show/hide in table.", "P1"),
    ("Save a **custom column view** with a name.", "View restores when re-selected.", "P2"),
    ("Click a column header to sort ascending.", "Rows re-order.", "P1"),
    ("Click again for descending.", "Order reverses.", "P1"),
    ("Click **row** to expand detail panel.", "Expanded section shows prices, R, excursion, tags, notes.", "P0"),
    ("From expanded row click **Edit Trade**.", "Add Trade editor opens with trade data.", "P0"),
    ("Verify **Manual** vs **Auto** source badge on rows.", "Correct badge per trade origin.", "P1"),
    ("Verify **edited** badge on modified trades.", "Edited indicator shows.", "P2"),
    ("Verify discipline label: According to Plan / Out of Plan / Missed Trade.", "Label matches trade data.", "P2"),
])

add("3 — Trades", 24, "Add Trade — Source Picker", [
    ("Click **Add Trade**.", "Source picker lists backtest sessions and journals.", "P0"),
    ("If only one eligible source, verify auto-select to editor.", "Skips picker when single source.", "P2"),
    ("Select a **backtest session** source.", "Add Trade editor opens scoped to that session.", "P0"),
    ("Select a **journal** source.", "Editor opens with journal-specific tabs (Discipline).", "P0"),
    ("First-time warning modal — read and dismiss.", "Modal closes; checkbox “Don’t show again” works.", "P2"),
])

add("3 — Trades", 25, "Add Trade — Trade & Risk Tab", [
    ("**Symbol** — open searchable dropdown; pick symbol.", "Symbol must be from source instrument list.", "P0"),
    ("**Side** — toggle Long / Short.", "Side updates; SL/TP validation rules flip.", "P0"),
    ("**Market** type field if shown.", "Market saves.", "P2"),
    ("**Entry date** — open calendar; pick date.", "Date populates.", "P0"),
    ("**Entry time** — set time; toggle 12h/24h or UTC/local if available.", "Time saves correctly.", "P1"),
    ("**Entry rows** — row 1: enter price + quantity; use +/- steppers.", "Steppers increment values.", "P0"),
    ("Add **second entry row** (scale-in).", "Multiple entries; avg entry recalculates.", "P1"),
    ("**Stop loss** — enter price.", "Required field; live risk preview updates.", "P0"),
    ("**Targets** — add target price row.", "Planned R updates in preview.", "P1"),
    ("**Exits** — add actual exit row with price + qty.", "Exit size tracked.", "P1"),
    ("Toggle **exit timing** (exit date/time).", "Exit date fields appear.", "P1"),
    ("**Commission**, **spread**, **slippage** fields.", "P&L preview adjusts.", "P1"),
    ("**Risk %** field.", "Risk calculation updates.", "P2"),
    ("**Excursion mode** — None / Standard / Extended.", "High/low fields show for standard+.", "P1"),
    ("Enter **highest price** and **lowest price** during trade.", "MFE/MAE metrics calculate.", "P1"),
    ("Extended: **post-exit high/low** + **window**.", "Post-exit excursion validates.", "P2"),
    ("Verify **live P&L preview** graph updates as you type.", "Chart/preview reacts to inputs.", "P1"),
])

add("3 — Trades", 26, "Add Trade — Tags, Discipline, Notes", [
    ("Go to **Tags** tab (arrow or tab click).", "Pre-tags and post-tags sections visible.", "P0"),
    ("Select **pre-trade tags** from strategy presets.", "Tags apply to trade.", "P1"),
    ("Select **post-trade tags**.", "Tags apply.", "P1"),
    ("**Strategy / Setup** dropdown — required for journal backtest trades.", "Must select before save.", "P0"),
    ("Go to **Discipline** tab (journal sources only).", "Plan review, demon patterns, behavior tags visible.", "P1"),
    ("Fill discipline fields.", "Values save on trade.", "P2"),
    ("Go to **Notes & Screenshots** tab.", "Pre/post notes text areas visible.", "P0"),
    ("Type **pre-trade notes** and **post-trade notes**.", "Text persists on save.", "P1"),
    ("Upload **pre screenshot** and **post screenshot**.", "Thumbnails appear.", "P1"),
])

add("3 — Trades", 27, "Add Trade — Save & Edit", [
    ("Fill valid trade → click **Save**.", "Trade appears in table; modal closes.", "P0"),
    ("Fill valid trade → click **Save & Add Another**.", "Trade saves; form resets for next entry.", "P1"),
    ("Edit existing trade from table → change SL → Save.", "Changes reflect in table and expanded row.", "P0"),
    ("Delete trade if delete action exists.", "Trade removed from list.", "P2"),
])

add("3 — Trades", 28, "Add Trade — Validation (test each error)", [
    ("Wrong symbol (not in source instrument list) → Save.", "Error: instrument must belong to source.", "P0"),
    ("Journal trade without strategy/setup → Save.", "Error: choose strategy for journal trade.", "P0"),
    ("Empty entry date/time → Save.", "Error: entry date and time required.", "P0"),
    ("Entry date **before** session start → Save.", "Error: within session date range.", "P0"),
    ("Entry date **after** session end → Save.", "Error: within session date range.", "P0"),
    ("**Future** entry date (live journal) → Save.", "Error: cannot be in future.", "P0"),
    ("Entry row with price=0 or qty=0 → Save.", "Error: price and size > 0.", "P0"),
    ("Missing **stop loss** → Save.", "Error: stop loss required.", "P0"),
    ("**Long** with SL above entry → Save.", "Error: SL must be below entries.", "P0"),
    ("**Short** with SL below entry → Save.", "Error: SL must be above entries.", "P0"),
    ("**Long** with target below entry → Save.", "Error: targets above entries.", "P0"),
    ("**Short** with target above entry → Save.", "Error: targets below entries.", "P0"),
    ("Exit size **greater than** entry size → Save.", "Error: exited size exceeds entered.", "P0"),
    ("Actual exit rows without **exit timing** enabled → Save.", "Error: enable exit time or clear exits.", "P1"),
    ("Exit time **before** entry time → Save.", "Error: exit after entry.", "P0"),
    ("Excursion: high **below** low → Save.", "Error: high must be above low.", "P1"),
    ("Negative commission → Save.", "Error: must be zero or greater.", "P1"),
    ("Very wide stop (huge R) → Save.", "Warning (non-blocking): unusually large R.", "P2"),
    ("No target set → Save.", "Warning: planned R blank.", "P2"),
])

# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4 — SOURCES WINDOW & SOURCE DETAILS
# ═══════════════════════════════════════════════════════════════════════════

add("4 — Sources", 29, "Open Sources Library", [
    ("From **Dashboard**, click the **source chip/banner** in header.", "Sources library overlay opens.", "P0"),
    ("Close with **Cancel**; from **Trades** click source switcher.", "Same library opens.", "P0"),
    ("From Compare mode, open compare source picker.", "Library/compare shell opens.", "P1"),
])

add("4 — Sources", 30, "Sources — Tree & Category Filters", [
    ("Locate **Source Tree** left panel.", "Tree shows Backtest Sessions and Live Journals.", "P0"),
    ("Expand **Backtest Sessions** → **Standard** / **Prop Firm**.", "Child nodes list sessions.", "P0"),
    ("Expand **Live Journals** → **Personal** / **Prop**.", "Journal accounts/entries listed.", "P0"),
    ("Click **Standard** mode filter.", "Only standard sessions in list.", "P1"),
    ("Click **Prop** mode filter.", "Only prop sessions.", "P1"),
    ("Status filter: **All / Not Started / Active / Completed**.", "List filters by progress.", "P1"),
    ("Journal type filters (Personal vs Prop).", "Journal list filters.", "P1"),
    ("Expand a **strategy group** node.", "Child sessions/journals under strategy appear.", "P1"),
    ("Collapse strategy group.", "Children hide.", "P2"),
])

add("4 — Sources", 31, "Sources — List, Selection & Footer", [
    ("Click a **session row** in content list.", "Row highlights as selected.", "P0"),
    ("Verify row shows: name, date range, trade count, market label.", "Metadata correct.", "P1"),
    ("Select a **journal account** row.", "Account details and trade count show.", "P1"),
    ("Select a **journal entry** (single trade scope).", "Single-trade source selected.", "P2"),
    ("Select a **strategy** parent — toggle child checkboxes.", "Partial child selection supported.", "P1"),
    ("Footer shows: selected name, type badge, trade count.", "Footer updates on selection.", "P0"),
    ("Click **Cancel**.", "Overlay closes; previous source unchanged.", "P0"),
    ("Select different source → click **Go**.", "Overlay closes; dashboard/trades reload with new source.", "P0"),
])

add("4 — Sources", 32, "Sources — Go Behavior by Type", [
    ("Go with **backtest session** selected.", "Dashboard loads session metrics; URL may show sessionId.", "P0"),
    ("Go with **strategy** (all children) selected.", "Aggregated metrics across linked sessions.", "P1"),
    ("Go with **strategy** partial children selected.", "Metrics scope to selected children only; “N/M sources” label.", "P1"),
    ("Go with **journal account** selected.", "Journal trades feed dashboard.", "P0"),
    ("Go with **journal entry** selected.", "Single trade scope on dashboard.", "P2"),
])

add("4 — Sources", 33, "Sources — Header Actions", [
    ("In library header click **Create Session** (backtest context).", "New session flow opens.", "P1"),
    ("In journal context click **Create Journal**.", "New journal account modal opens.", "P1"),
    ("Click **Add Trade** (journal context).", "Add trade flow opens for journal.", "P1"),
])

add("4 — Sources", 34, "Applied Source Details (Dashboard Banner)", [
    ("After applying a source, read **banner/chip**: name + type badge.", "Backtest=blue, Journal=green, Strategy=blue.", "P0"),
    ("Verify **trade count in scope** on banner.", "Count matches filtered trades.", "P1"),
    ("Apply strategy with partial children — read “N/M sources” label.", "Partial selection label correct.", "P1"),
    ("Empty journal: verify CTAs **Create Journal**, **Add Trade**, **Import**.", "CTAs visible and work.", "P2"),
])

add("4 — Sources", 35, "Compare Sources Mode", [
    ("Enable **Compare mode** from dashboard.", "Compare picker opens.", "P1"),
    ("Tabs: **Backtests / Strategies / Journals**.", "Each tab lists correct source types.", "P1"),
    ("Multi-select two sessions for compare.", "Both sources active in compare chip.", "P1"),
    ("Toggle strategy child sources in compare.", "Sub-source selection works.", "P2"),
    ("Open **Compare filters** window.", "Separate filter scope for compare view.", "P2"),
    ("Click **Clear compare** (trash icon).", "Compare mode exits; single source restored.", "P1"),
    ("Verify dashboard metrics update for compare view.", "Side-by-side or combined metrics display.", "P1"),
])


def build():
    wb = Workbook()

    # Instructions
    ws_i = wb.active
    ws_i.title = "Instructions"
    ws_i["A1"] = "TALARIA DASHBOARD — UAT TEST TRACKER"
    ws_i["A1"].font = Font(bold=True, size=14, color="1F4E79")

    sections_summary = [
        ("", ""),
        ("Testers", "2 people — split by section or work in pairs per phase."),
        ("Entry URL", "https://your-domain/dashboard/ (log in first)."),
        ("Order", "Complete sections in order: 1 Strategies → 2 Sessions → 3 Trades → 4 Sources."),
        ("Steps", "Follow numbered steps in QA Tracker. Do not skip validation steps in Section 3 Phase 28."),
        ("Result", "☑ Pass = works as expected | ☐ Fail = broken | ⚠ Partial = mostly works | — Not tested"),
        ("Issues", "Mark Issue? = ☑ Yes for any bug; explain in Comments."),
        ("Priority", "P0 = launch blocker — stop and report immediately."),
        ("", "SUGGESTED SPLIT FOR 2 TESTERS"),
        ("Tester A", "Sections 1–2 (Strategies + Sessions) — Phases 1–20"),
        ("Tester B", "Sections 3–4 (Trades + Sources) — Phases 21–35"),
        ("Cross-check", "Swap: Tester A does Section 3, Tester B does Section 1 on day 2."),
        ("", "SECTION OVERVIEW"),
        ("1 — Strategies", "Phases 1–9: Strategy Bank page + 4-step Strategy Builder"),
        ("2 — Sessions", "Phases 10–20: Sessions list + New Session modal (all fields)"),
        ("3 — Trades", "Phases 21–28: Trades table + Add Trade editor + validation"),
        ("4 — Sources", "Phases 29–35: Sources library + applied source + compare"),
        ("", f"Total numbered steps: {len(STEPS)}"),
    ]
    ws_i.column_dimensions["A"].width = 22
    ws_i.column_dimensions["B"].width = 88
    for r, (a, b) in enumerate(sections_summary, 2):
        ws_i.cell(r, 1, a).font = Font(bold=bool(a and a != "SUGGESTED SPLIT FOR 2 TESTERS"))
        ws_i.cell(r, 2, b).alignment = Alignment(wrap_text=True, vertical="top")

    # QA Tracker
    headers = [
        "Step #", "Section", "Phase", "Phase Name", "Priority",
        "What to Do", "Expected Result",
        "Tester A", "Tester B", "Issue?", "Comments", "Date",
    ]
    ws = wb.create_sheet("QA Tracker")
    for c, h in enumerate(headers, 1):
        ws.cell(1, c, h)
    fill_hdr = PatternFill("solid", fgColor="1F4E79")
    font_hdr = Font(bold=True, color="FFFFFF", size=10)
    thin = Side(style="thin", color="CCCCCC")
    for c in range(1, len(headers) + 1):
        cell = ws.cell(1, c)
        cell.fill = fill_hdr
        cell.font = font_hdr
        cell.border = Border(left=thin, right=thin, top=thin, bottom=thin)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    section_colors = {
        "1 — Strategies": "E8F4FD",
        "2 — Sessions": "E8F5E9",
        "3 — Trades": "FFF8E1",
        "4 — Sources": "F3E5F5",
    }
    current_section = None
    sec_fill = None

    for i, s in enumerate(STEPS, 1):
        row = i + 1
        ws.cell(row, 1, i)
        ws.cell(row, 2, s["section"])
        ws.cell(row, 3, s["phase_num"])
        ws.cell(row, 4, s["phase_name"])
        ws.cell(row, 5, s["priority"])
        ws.cell(row, 6, s["instruction"])
        ws.cell(row, 7, s["expected"])
        ws.cell(row, 8, "— Not tested")
        ws.cell(row, 9, "— Not tested")
        ws.cell(row, 10, "— Not tested")
        for col in range(1, 11):
            ws.cell(row, col).alignment = Alignment(vertical="top", wrap_text=True)
        if s["section"] != current_section:
            current_section = s["section"]
            sec_fill = PatternFill("solid", fgColor=section_colors.get(current_section, "FFFFFF"))
        for col in range(1, 5):
            ws.cell(row, col).fill = sec_fill

    last = len(STEPS) + 1
    dv = DataValidation(type="list", formula1=RESULT_LIST, allow_blank=True)
    ws.add_data_validation(dv)
    dv.add(f"H2:I{last}")
    dv2 = DataValidation(type="list", formula1=ISSUE_LIST, allow_blank=True)
    ws.add_data_validation(dv2)
    dv2.add(f"J2:J{last}")

    widths = [8, 16, 7, 28, 8, 52, 40, 14, 14, 10, 36, 12]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{last}"

    # Summary by phase
    ws_s = wb.create_sheet("Summary")
    sh = ["Phase", "Phase Name", "Section", "Steps", "A Pass", "B Pass", "Fails", "Issues", "Done %"]
    for c, h in enumerate(sh, 1):
        ws_s.cell(1, c, h)
        ws_s.cell(1, c).fill = fill_hdr
        ws_s.cell(1, c).font = font_hdr

    phases = []
    seen = set()
    for s in STEPS:
        key = s["phase_num"]
        if key not in seen:
            seen.add(key)
            phases.append((key, s["phase_name"], s["section"]))

    tr = "'QA Tracker'"
    for i, (pn, pname, sec) in enumerate(phases, 2):
        ws_s.cell(i, 1, pn)
        ws_s.cell(i, 2, pname)
        ws_s.cell(i, 3, sec)
        ws_s.cell(i, 4, f'=COUNTIFS({tr}!C:C,{pn})')
        ws_s.cell(i, 5, f'=COUNTIFS({tr}!C:C,{pn},{tr}!H:H,"☑ Pass")')
        ws_s.cell(i, 6, f'=COUNTIFS({tr}!C:C,{pn},{tr}!I:I,"☑ Pass")')
        ws_s.cell(i, 7, f'=COUNTIFS({tr}!C:C,{pn},{tr}!H:H,"☐ Fail")+COUNTIFS({tr}!C:C,{pn},{tr}!I:I,"☐ Fail")')
        ws_s.cell(i, 8, f'=COUNTIFS({tr}!C:C,{pn},{tr}!J:J,"☑ Yes")')
        ws_s.cell(i, 9, f'=IF(D{i}=0,0,ROUND((E{i}+F{i})/(D{i}*2)*100,0)&"%")')

    tot = len(phases) + 2
    ws_s.cell(tot, 2, "TOTAL").font = Font(bold=True)
    ws_s.cell(tot, 4, f"=SUM(D2:D{len(phases)+1})")
    for col, letter in [(5, "E"), (6, "F"), (7, "G"), (8, "H")]:
        ws_s.cell(tot, col, f"=SUM({letter}2:{letter}{len(phases)+1})")

    for i, w in enumerate([7, 30, 16, 8, 10, 10, 8, 8, 10], 1):
        ws_s.column_dimensions[get_column_letter(i)].width = w

    # Per-section sheets
    for sec_key, sec_label, color in [
        ("1 — Strategies", "S1 Strategies", "2E5090"),
        ("2 — Sessions", "S2 Sessions", "2E7D32"),
        ("3 — Trades", "S3 Trades", "E65100"),
        ("4 — Sources", "S4 Sources", "6A1B9A"),
    ]:
        wsp = wb.create_sheet(sec_label)
        for c, h in enumerate(headers, 1):
            wsp.cell(1, c, h)
            wsp.cell(1, c).fill = PatternFill("solid", fgColor=color)
            wsp.cell(1, c).font = font_hdr
        r = 2
        for i, s in enumerate(STEPS, 1):
            if s["section"] != sec_key:
                continue
            wsp.cell(r, 1, i)
            wsp.cell(r, 2, s["section"])
            wsp.cell(r, 3, s["phase_num"])
            wsp.cell(r, 4, s["phase_name"])
            wsp.cell(r, 5, s["priority"])
            wsp.cell(r, 6, s["instruction"])
            wsp.cell(r, 7, s["expected"])
            wsp.cell(r, 8, "— Not tested")
            wsp.cell(r, 9, "— Not tested")
            wsp.cell(r, 10, "— Not tested")
            r += 1
        if r > 2:
            dv_a = DataValidation(type="list", formula1=RESULT_LIST, allow_blank=True)
            wsp.add_data_validation(dv_a)
            dv_a.add(f"H2:I{r-1}")
            dv_b = DataValidation(type="list", formula1=ISSUE_LIST, allow_blank=True)
            wsp.add_data_validation(dv_b)
            dv_b.add(f"J2:J{r-1}")
        wsp.freeze_panes = "A2"
        for i, w in enumerate(widths, 1):
            wsp.column_dimensions[get_column_letter(i)].width = w

    wb.save(OUTPUT)
    print(f"Created {OUTPUT}")
    print(f"Sections: 4 | Phases: {len(phases)} | Steps: {len(STEPS)}")


if __name__ == "__main__":
    build()
