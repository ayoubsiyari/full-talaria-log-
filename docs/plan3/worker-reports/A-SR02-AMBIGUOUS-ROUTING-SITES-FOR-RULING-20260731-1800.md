# A — the 36 ambiguous input-routing sites, grouped by the decision they need

**2026-07-31 18:00** · Manager A · SR-02 focus routing · base `79625eac6`
**Purpose: one pass of rulings, not 36.** Every site below is `AMBIGUOUS` in
`docs/plan3/evidence/A-SR02-FOCUS-ROUTING-20260731/window-chart-classification.json`.

## How to read this

The census found 199 raw AST nodes / 155 logical sites reading `window.chart` across 60 files. The four-way
classification resolved all but 36. **Those 36 collapse into five policy calls.** Rule the policy and every site
under it follows; no site needs an individual decision.

The shared reason for ambiguity is recorded identically by the classifier — *"bare existence guard / value passed
on; intent not decidable from the resolution expression"* — i.e. the code reads `window.chart`, checks it is
truthy, and passes it on. **The resolution expression cannot tell us whether the author meant "the host chart",
"the chart the user is working in", or "my own chart"**, because in a single-realm world those were the same
object. That is precisely what the conversion has to disambiguate.

Counts: 14 + 3 + 5 + 9 + 5 = **36**.

---

## POLICY 1 — Does host chrome follow hover, or last click? (14 sites)

**Question.** Menus, sidebars, and overlays live once in the host document while N charts exist. When such a
surface reads "the chart", which one does it mean?

**A's recommendation: last interaction (click / focus), never hover.**

**Reason.** Hover-following breaks the ordinary case: the user opens a menu for panel A, and the pointer crosses
panel B on its way to the menu. A hover-following read silently retargets, and the user reconfigures a chart they
were not looking at. There is no affordance that would tell them. Click-established focus is also what the
existing `MultichartGrid` provider already does, so this is the cheaper conversion as well as the safer one.

| site | surface |
| --- | --- |
| `economic-news-sidebar.js:261` | news sidebar resolves "the chart" |
| `economic-news-sidebar.js:1365` | " |
| `economic-news-sidebar.js:1577` | " |
| `economic-news-sidebar.js:1587` | " |
| `favorites-manager.js:628` (`activateTool`) | favourites applies a tool |
| `indicator-ui.js:4010` | indicator chrome |
| `indicator-ui.js:4964` | " |
| `indicator-ui.js:6247` | " |
| `compare-overlay.js:285` (`_bindCompareModalDomOnce`) | compare modal binding |
| `compare-overlay.js:323` (`setupEventListeners`) | " |
| `screenshot-manager.js:1706` | which chart is captured |
| `screenshot-manager.js:1707` | " |
| `chart.js:17215` (`hideSettingsMenu`) | settings menu target |
| `chart.js:18419` (`setupSymbolSearchSwitcher`) | symbol switcher target |

Eight of these use the `window.chart || window.mainChart` idiom, which is a second fallback chain that should
collapse into the same provider rather than surviving alongside it.

---

## POLICY 2 — Who owns a gesture already in flight? (3 sites)

**Question.** A pan or drag begins in one panel and the pointer travels. Which instance owns the events?

**A's recommendation: the instance that received `pointerdown` owns the gesture until `pointerup`**, regardless
of what the pointer later crosses and regardless of any focus change during the drag.

**Reason.** These three sites are reached *during* a gesture, and one of them (`checkViewportLoadMore`) can
trigger a data fetch mid-drag. If ownership can change mid-gesture, a pan that crosses a panel boundary issues
the second half of its deltas to a different chart, and the load-more fires against a viewport that is not the
one being dragged. Pointer capture is the standard remedy and it makes the ownership explicit rather than
inferred.

| site | role |
| --- | --- |
| `chart.js:19329` (`_findActivePanChart`) | resolves the pan target — the decision point itself |
| `chart.js:5352` (`_panelPanHistoryGapNeedsHostMore`) | asks whether the pan needs more history |
| `chart.js:25755` (`checkViewportLoadMore`) | fires a fetch from viewport position |

---

## POLICY 3 — Do trade actions follow focus, or the order's own chart? (5 sites)

**Question.** `orderManager` is shared host-wide; panels do not each own one. When order code reads "the chart",
does it mean the focused panel, or the chart the order belongs to?

**A's recommendation: the order's chart, resolved from the order record — never focus, never hover.**

**Reason, and this is the group I would least like ruled the other way.** A focus-following read means a trade
journals against whichever panel the user happened to be looking at when it closed. That is a P&L-attribution
defect of the same class as the scaled-group defect fixed earlier this week, where an accidentally grouped
position merged independent trades into one journal row. `saveTradeToJournal` and `getCurrentCandle` are both on
the path that decides what price and what instrument a trade is recorded against. **This group should be ruled
before the conversion starts, because getting it wrong produces silently wrong trade history rather than a
visible misroute.**

| site | role |
| --- | --- |
| `order-manager.js:13535` (`saveTradeToJournal`) | journal write path |
| `order-manager.js:13537` (`saveTradeToJournal`) | " |
| `order-manager.js:31630` (`placeOrderFromDrawingTool`) | order placement from a drawing |
| `order-manager.js:31632` (`placeOrderFromDrawingTool`) | " |
| `order-manager.js:32514` (`getCurrentCandle`) | price/instrument resolution |

---

## POLICY 4 — Which reads are genuinely host-wide and must NOT be converted? (9 sites)

**Question.** Some of these look like routing sites and are not.

**A's recommendation: leave all nine reading the host. Converting them would be the defect.**

**Reason.** Three are idempotent boot guards, one is an identity discriminator that only looks like a target, one
is cross-panel by design, and four are host-wide services that legitimately apply to everything.

| site | why it stays host |
| --- | --- |
| `chart.js:549` | boot-time existence guard |
| `chart.js:42890` | `_talariaInitializeChart` idempotent early return — **belongs to the registry work, explicitly not to routing**; standing instruction is to work around it, not delete it |
| `indicator-ui.js:3107` | same idempotent shape |
| `chart.js:17248` (`_applyChartSettingsImmediate`) | **not a target** — `targetChart === window.chart` is an identity test meaning "am I the host" |
| `drawing-tools-manager.js:844` (`_setupCrossPanelDeselect`) | cross-panel on purpose; deselecting in one panel must clear others |
| `chart-window-limit.js:185` | host-wide window limit |
| `replay-dashboard-sync.js:11` | dashboard is host chrome |
| `replay-system.js:10678` | passes a literal `'main'` alongside — host is explicit in the call |
| `v9-theme-bridge.js:203` | theme applies to all panels |

---

## POLICY 5 — Which are simply per-instance? (5 sites)

**Question.** Do these need focus at all?

**A's recommendation: no. Use `this`. No focus provider involved.**

**Reason.** Indicators belong to the chart that owns them; reaching through `window.chart` was only ever
shorthand for `this` when there was one chart.

| site |
| --- |
| `chart-indicators-full.js:2206` |
| `chart-indicators-full.js:2305` |
| `chart-indicators-full.js:3144` |
| `chart-indicators-full.js:4963` |
| `indicator-ui.js:3100` |

---

## Two items in this set that are not routing decisions

**1. `chart.panelManager` is never assigned, and 100 references depend on it.**
`indicator-ui.js:3100` reads `window.chart.panelManager` **unguarded**. Across the whole chart tree there are
exactly two assignments and **neither is to the instance property**: `legacy-index.html:47168` does
`window.panelManager = new PanelManager(panelsContainer)`, and `chart-host.html:212` sets
`window.panelManager = undefined`. Control on the same matcher: `drawingManager =` returns 24 assignments, so the
search sees content. **Every branch gated on `chart.panelManager` has been dead since the May deletion of
`panel-manager.js`, and 100 mentions of the removed subsystem remain in the engine.** This wants a cleanup
packet, not a routing ruling.

**2. The legacy shell is not live — settled by fetch, no browser run needed.**
See the separate finding below; it removes the follow-up rather than scheduling it.

---

## Recommended ruling format

Five lines is enough:

1. Chrome follows **click**, not hover.
2. Gestures are owned by **pointerdown capture** until pointerup.
3. Trade actions resolve through the **order record**, not focus.
4. The nine host-wide sites **stay host** and the boot guards defer to the registry work.
5. The five indicator sites become **`this`**.
