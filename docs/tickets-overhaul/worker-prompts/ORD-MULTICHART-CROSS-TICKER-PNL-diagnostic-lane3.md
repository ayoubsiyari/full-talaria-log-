# Lane 3 — Multichart order cross-ticker price bleed + wrong PnL (URGENT diagnostic)

Status: READ-ONLY DIAGNOSTIC. No product edits. Build under test: `20260717b16`.

## PO evidence (image, Trades panel)
Multichart, **two panels, different tickers/TFs**. One order set per panel.
- Trade #2 **GBP/USD** Long: entry `1.64683`, **exit `1.31315`**, size 2.63 → PnL **-587757.04**.
- Trade #1 **EUR/USD** Long: entry `1.31321`, exit `1.31316`, size 6.25 → PnL -$31.25.

The GBP/USD trade's **exit price `1.31315` is a EUR/USD-range price** — i.e. the GBP order
was marked/closed using the *other* panel's price feed. That cross-ticker contamination is
the root of the absurd PnL, not the PnL formula itself.

## Also reported (same session, likely same root)
- "Set order on multichart doesn't work good on both charts" — panel-B order add/interaction
  intermittently fails or applies to the wrong panel (ties to the ORD-MULTICHART-PARITY family
  and A6-4 host-canonical order store, RATIFIED/deferred).

## Questions (evidence, exact file/lines)
1. When an order is created/closed in a multichart panel, where does it read the **mark/last price**?
   Pinpoint whether it reads the focused/active panel's price series vs the panel that owns the
   order. Cite `order-manager.js` + the multichart price-feed path.
2. Is order state keyed per-symbol/per-panel, or is there a single shared last-price that the
   most-recently-updated panel overwrites (EUR panel updating GBP order's mark)? Prove which.
3. Reproduce deterministically: 2 panels (GBP/USD + EUR/USD, different TF), one order each,
   step/close → capture the exit price each order records vs the correct owning-panel price.
4. Confirm relationship to A6-4 (host-canonical order store): is this the exact failure A6-4
   was ratified to fix, or a separate narrower price-source bug that can be fixed pre-A6-4
   with a freeze-safe one-knob guard (own kill-switch)?
5. Cross-check the earlier ORD-DUP-DURATION finding — is the wrong-duration/duplication the
   same cross-panel bleed or independent?

## Deliverable
`docs/tickets-overhaul/worker-reports/ORD-MULTICHART-CROSS-TICKER-PNL-diagnostic-report.md`:
- Root mechanism + exact file/lines for the wrong price source.
- Deterministic repro + captured evidence (owning-panel price vs recorded exit).
- Whether pre-A6-4 freeze-safe fix is possible (scope + kill-switch name) or must wait for A6-4.
- A RED scenario spec that pins it (GBP order in multichart must record GBP price, never peer's).

## Guardrails
I15 honest actuation. No product edits in this task. No chart.js edits. Read-only.
