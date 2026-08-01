# E roadmap archaeology delta

**2026-07-31** · Manager E · packet `E-ROADMAP-ARCHAEOLOGY-DELTA-V1`

Scope: `chart v 1.4/chart/multi_chart_rebuild_roadmap.md`, read only for facts that change an existing
decision. This is not a summary.

## Decision-Changing Findings

1. The roadmap does **not** document the PO-described shared 12,000-candle store or one-engine predecessor.
   Searches for `12,000`, `12000`, shared store, one engine and predecessor architecture did not find that
   design. The open thread remains open: this roadmap should not be treated as evidence for the 12,000-candle
   shared-store architecture or why that specific predecessor was abandoned.

2. It does independently confirm the abandonment reason for the known predecessor class: bundled state
   sharing leaked price-axis range across mismatched timeframes. The stated root cause is that chart B
   inherited too much of chart A's view state, including price-axis range. That supports the current decision
   to make price-axis isolation the first correctness invariant, ahead of generic messaging hazards.

3. It adds one sharper reason same-timeframe tests are insufficient: the bug class only appears with
   mismatched timeframes. Any parity gate that does not include mismatched timeframes can falsely clear the
   original bug. This reinforces CONF-01's four distinct timeframes and should remain non-negotiable.

4. It names visible-time-range sync as the high-risk phase and says the receiver must recompute price axis
   from its own visible candles after applying synced time range. This changes the acceptance wording for
   Phase 4/single-realm from "message allowlist is clean" to "after a higher-TF pan, the lower-TF peer's
   price range is derived from its own visible candles and candles do not compress."

5. It adds resize as a separate route back to the same symptom: pane resize must trigger each chart's own
   price-axis recompute. That is not evidence about the predecessor architecture, but it is decision-changing
   for parity coverage because the original candle-compression symptom can happen without sync if layout
   resize leaves stale axis state.

No roadmap finding contradicts the 14:25 ruling. The document strengthens the price-axis invariant and
CONF-01 mismatch requirements, but it does not close the 12,000-candle shared-store archaeology thread.
