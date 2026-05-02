# Talaria v8b — Continue Building

I'm handing off an ongoing UI/UX design project. All project files are uploaded. Please read them all before responding.

## Project
**Talaria** — an Arabic-native backtesting & replay trading platform for MENA futures traders. We're building a single-file React JSX component (`talaria-v8b.jsx`) that renders a full charting tool UI mockup.

## Files Uploaded
- `talaria-v8b.jsx` — THE component (~96KB, single source of truth)
- `DESIGN_SYSTEM.md` — color tokens, typography, component patterns
- `WORKING_INSTRUCTIONS.md` — how to reference sections for changes
- `Untitled_design.pdf` — reference screenshots of drawing tool dropdowns

## First Task
Render `talaria-v8b.jsx` as an artifact so I can see it and verify everything works. Don't change anything yet — just show it.

## Design Language (Key Rules)
- **Font**: `'Exo 2', sans-serif` (Google Fonts, weights 400-900)
- **Colors**: Blue primary `#2643F7`/`#4A6AFF`, Gold accent `#C9A84C`, Green `#00D4A1`, Red `#FF5068`, dark backgrounds `#07080E`/`#0A0C14`
- **Active states**: Blue gradient-fade underline with glow (same pattern on timeframes, tabs, tool buttons, replay bar)
- **Hover states**: Faint white gradient underline
- **Pins**: Gold `#C9A84C`, tilt -25° + scale 1.15× on hover
- **Wells**: Recessed dark backgrounds with inset shadow for inputs/panels
- **Only one window/panel open at a time**
- **Right panels (News, Objects Tree, Layout) slide in replacing the Order Panel** — only one at a time, chart expands when all closed
- **Floating windows (Indicators, Settings, Profile, FAQ, Screenshot)** are draggable via transparent overlay technique
- **No useEffect** — removed to save file size, font falls back to sans-serif or load via CDN

## What's Built
Top bar, left tool rail (12 groups with dropdowns + pins), chart area, replay bar (mode/play/speed/next/rollback/goto), positions panel, right sliding panels (news/objects tree/layout), order panel, indicators dialog, settings/profile/FAQ/screenshot windows.

## Size Constraint
**The artifact sandbox has a ~100KB limit.** File is currently ~96KB. When adding features, keep it compact — one-liner JSX for simple things, avoid large data arrays. If the file grows past ~100KB, trim non-essential content.

## What Was Simplified to Fit Size (Can Be Expanded Later)
- Settings dialog (was 23KB with full visual crosshair selectors, color pickers, theme previews)
- Profile dialog (was full Account/Billing tabs)
- FAQ dialog (was full Education/FAQ/Hot Keys/About tabs)
- Screenshot preview (was full with simulated chart candles)
- Go-To popup (was full with Pinned/All/Add tabs for date, daily time, and price jumps)
- News/Objects Tree/Layout panels (were more detailed)
- Timezone selector and color picker overlays (removed)

## How I Work
- I give specific changes referencing section names (TOP BAR, LEFT RAIL, CHART AREA, REPLAY BAR, ORDER PANEL, etc.)
- I often attach screenshots of my drafts for reference
- I want you to follow the established design language precisely
- When I say "use our style" I mean the Talaria design system patterns above
- Keep innovations within the established aesthetic — no rounded corners on tools, blue gradients for active states, well backgrounds for inputs
