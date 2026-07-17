# Retest checklist — what's resolved vs what to test vs what's still in progress

Snapshot 2026-07-17. Scoreboard: **27 CLOSED-VERIFIED / 155 = 17.4%**. 25 STAGED (fix done,
awaiting your retest) · ~100 IN-TRACK (still being worked).

---

## ✅ RESOLVED — CLOSED-VERIFIED (27) — no action needed
Multichart interaction (RC-1, RC-4, H-R02–H-R07, H-R12), replay (H-S18/20/25/28/79/80/82/83),
panel-freeze/edge-park (TAL-01590), 2-layout replay cadence (TAL-01600), multichart order
cross-ticker PnL (ORD-XPNL) + dup/duration (ORD-DUP-DURATION), TAL-01609/01610/01626, and
tester-closed TAL-01588/01596.

---

## 🧪 READY TO VERIFY NOW — 25 STAGED (fix landed, your PASS flips them CLOSED)
Test on the current deployed checkpoint. Each = one row that closes on PASS.

### Test set A — Orders (single-chart + persistence)
- [ ] **A6-1** — set order, drag SL/TP, release → applies on release, no snap
- [ ] **A6-2** — set orders → F5 → orders persist
- [ ] **A6-3** — order-half interaction behaves
- [ ] **OrderEntry#4 / #5** — keyboard-pan while order armed doesn't misfire
- [ ] **TAL-01653** — order position correct
- [ ] **TAL-01616** — order survives refresh
- [ ] **TAL-01602** — SL/TP lines behave during replay PLAY
- [ ] **TAL-01638** — order-type auto-reclassify correct

### Test set B — Replay / intervals
- [ ] **TAL-01612** — 1m replay does NOT jump forward 10+ days
- [ ] **TAL-01611** — replay chart behavior
- [ ] **TAL-01581 / TAL-01582** — interval + tick-by-tick replay cadence
- [ ] **TAL-01647 / TAL-01650** — replay/layout
- [ ] **TAL-01629 / TAL-01631** — chart re-render on replay
- [ ] **H-S30** — step-spam refetch (no excess fetches on tick play)

### Test set C — Drawing / anchoring (RC-3)
- [ ] **RC-3** — labels/drawings don't drift-anchor across TF/paste/fractional
- [ ] **TAL-01585** — layers/drawings don't move when changing timeframe
- [ ] **H-S40 / H-S41** — bar-open anchoring stable

### Test set D — Indicators (RC-6)
- [ ] **RC-6** — indicator lifecycle / visibility / settings-apply / replay UI sync

### Test set E — Panning / render (RC-2)
- [ ] **RC-2** — no grid-over-candles / slow render while panning

### Test set F — Order-entry parse (RC-5)
- [ ] **RC-5** — order-entry number parse / drag-input family

---

## 🔧 STILL IN PROGRESS — IN-TRACK (~100) — not ready to test
Largest buckets: A1 axis (11), UI-polish L5 (8), T8 replay/mirror (8), A7/A7b perf (12),
T1 lifecycle (4), A8 drawing tranches (4), T3 layout-state rows (row11/13/14/15/16), plus the
new finds (MC-STEPFWD step-forward, MC-DRAW-FIRSTCLICK draw-on-click-1). These are being fixed
or specced; I'll move them to STAGED as builds land, then they join the list above.

---

## How the number moves
Each STAGED row you PASS flips to CLOSED-VERIFIED. All 25 verified = **~+16 points → ~33%**,
with zero new engineering — it's all sitting ready on your sign-off.
