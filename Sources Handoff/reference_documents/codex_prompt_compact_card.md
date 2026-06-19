# Codex Prompt — Compact the trade detail card (remove empty space)

## Goal
The expanded trade card's content is right, but it has too much empty space: the risk-to-reward bar sits centered with large empty margins, its band is too tall, and the detail groups are short so there's a dead zone beneath them while Journal stretches the card tall. Tighten the layout so the card is dense and balanced. Content stays the same — this is layout only. Visual reference: `trades_card_compact.html`.

## HARD CONSTRAINT — Talaria's standard design
Layout/spacing changes only. Reuse existing components, tokens, the risk-to-reward bar, Exo 2, value colors. No new visual language, no content removed.

## 1. Make the hero bar fill the width
- Scale the bar's axis from `−1R` to just past the furthest marker (≈ `+4.6R` for this trade, i.e. `max(target, MFE) + small padding`) and spread it across the **full card width** with only small side padding. Stop should sit near the left edge and MFE near the right edge — eliminate the large empty margins on either side.
- **Shorten the band**: reduce its vertical height and the padding above/below so it isn't mostly air. Keep the band-model label rows (markers above, axis labels below) but tighten their spacing.

## 2. Three balanced columns instead of five short ones
Replace the single row of five short groups with **three columns of roughly equal height**, by stacking the short groups:
- **Column 1**: Prices, then Risk / R (stacked).
- **Column 2**: Excursion, then Timing (stacked).
- **Column 3**: Journal (pre-tags, post-tags, notes, demons).
Use proportional widths so the columns fill the card (Journal widest, e.g. `1fr 1fr 1.5fr`). This removes the dead zone that appeared under the short groups, since each column now ends at about the same height.

## 3. Tighten overall spacing
- Reduce the card's outer padding and the per-row vertical spacing in the detail groups so the card reads dense, not sparse.
- The card's total height should be noticeably shorter while showing the same fields.

## Acceptance
- The risk-to-reward bar spans the full card width (scaled `−1R → ~+4.6R`); no large empty margins; MFE near the right edge; the band is shorter.
- Detail groups are in three balanced columns (Prices+Risk, Excursion+Timing, Journal) that end at roughly equal height; no empty zone beneath the short groups.
- Spacing is tighter; the card is shorter overall with no content removed.
- Styling matches existing tokens/components.
