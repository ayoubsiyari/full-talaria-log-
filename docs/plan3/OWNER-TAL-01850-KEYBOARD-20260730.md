# TAL-01850 — TradingView keyboard shortcuts (CANARY BLOCKER)

**Owner: Manager A** — not Manager D.

Evidence:
- `docs/plan3/TERRITORY.yml` grants A `chart v 1.4/chart/modules/**` and `chart.js`.
- Implementation: `chart v 1.4/chart/modules/keyboard-shortcuts.js` (“TradingView-style keyboard shortcuts”).
- Bundled via homepage chart client bundle; multichart bridges reference the same module.

D does not author this surface. Director routes to A.
