# RULING — the design-layer lane, four checks run, and where the advisor is now out of date

**Director · 2026-07-30 11:10 · binding on A, B, C, D**

Source: `docs/advisor/SUGGESTIONS-DESIGN-LAYER-AND-DASHBOARD-TRANSFER.md`, supplied by
the PO. It is the strongest analytical document in this plan's history and most of it
is adopted verbatim. This ruling records what I checked immediately, what it
eliminated, and the one place where measurements taken after the advisor wrote have
overtaken its calibration.

## Checks run in the five minutes after reading. All static, all cheap.

**§4.4 — inline source maps. NEGATIVE, and cleanly so.** No `sourceMappingURL=data:`
in any served bundle over 100 KB. The advisor called this "a one-line check with
unusually high leverage"; the leverage was in getting a candidate off the board for
five seconds of grep, and it is off. Only `source-map.debug.js`, a debug tool,
carries one.

**§1.1 second mechanism — runtime `insertRule` / `deleteRule`. ZERO occurrences**
outside the harness. Eliminated.

**§1.1 leading mechanism — per-frame custom property writes. OWNERSHIP FLIPS TO THE
ENGINE.** `setProperty` call sites: `chart.js` **35**, `talaria-toast-stack.js` 7,
`screenshot-manager.js` 5, `drawing-tools-ui.js` 4, `order-manager.js` 3, and the
entire V9 design bundle **3**. If something writes a custom property every frame, it is
overwhelmingly likely to be product engine code, not the design layer. **The advisor
pre-called this in its own override line** — "the fix is the same shape but the
ownership is different" — and that is exactly what the evidence says. The hypothesis
survives; the suspect changes. Static counts cannot prove per-frame execution, so the
runtime check in §5.1 still decides it.

**§D-3 — `will-change` layer explosion. WEAK.** Two occurrences in the whole V9
bundle. Not the layer-churn source. Deprioritised, not closed, since the Layers panel
is the real instrument.

## Unlooked-for finding — the served tree contains the test harness

`homepage/public/chart/` is serving `multichart-prod/harness/node_modules/` including
`puppeteer-core` (966 KB) and `chromium-bidi`, **1,120 `.map` files**, and a `frozen/`
directory holding whole duplicate copies of `chart.js` (1,927 KB) and
`order-manager.js` (2,331 KB).

None of it is loaded by the page, so it is not a memory defect. It is a **deployment
hygiene and disclosure defect**: internal test tooling, dependency trees and source
maps are publicly reachable on the canary host. **B owns it.** Exclude the harness,
`node_modules`, `frozen/` and `.map` files from the served image before canary. This
also shrinks the deploy and speeds every rebuild.

## Where the advisor is now out of date, and it is the advisor's own preferred
## correction mechanism that says so

Part 6 states that bar data held as JS objects is "likely the largest single term
(~165 MB for one 3-year 1-minute series)" and that the design layer explains only part
of "the 383 MB floor."

**Both halves of that framing have since been measured and both are wrong** — and I
held the same view an hour earlier, so this is a correction to a shared position, not
to the advisor alone.

**Bar data is not the largest term.** PO scaling test, four-pair fresh sessions:
3 days 181 MB, 3 months 188 MB, 3 years 275 MB. Two to three orders of magnitude more
data for **1.52x** the heap. The columnar rewrite this reasoning implied was authorised
and then cancelled on this evidence within ninety minutes.

**The 383 MB floor was never the number.** Brave Task Manager, DevTools closed:
renderer 298 MB of which **JavaScript is 102 MB**, plus a **263 MB GPU process**, on a
*single* chart. Four charts playing: renderer 949 MB at 186% CPU, GPU 504 MB,
**~1.6 GB and ~224% of a core in total**. A panel costs ~80 MB and **only ~8 MB of it
is JavaScript**.

The consequence reaches the advisor's Part 6 conclusion directly. It reads "unproven
for memory" on the design-layer hypothesis. In fact the design layer is now the
**confirmed** source of the largest single identified memory item we have: brand logos
exported at 4720x2234, 87 KB on disk, **40.2 MB decoded each**, accounting for the
measured 63 MB image cache. That is D-12 in the advisor's own checklist, and it scored.

**Part 6's one negative prediction stands and is reinforced.** "It probably does not
explain the 11-18 documents." Correct. C has since reproduced a document staircase
(2 → 3, 5, 7, 10 over four cycles) and attributes it to realm retention, not design.

## Adopted verbatim, binding

**§4.1 — a pack of small monsters, and kills are reported as a count.** This has been
the PO's position since before the advisor wrote it down and today has vindicated it
repeatedly. No single fix is expected to resolve everything, and no manager may frame
one as such.

**§4.5 — visual parity gates design-layer work. This is urgent and immediate.** B is
about to resize brand assets, which is a visual change, on the highest
visual-regression-risk surface on the board. A green build is not visual verification.
**B does not merge asset work without a before-and-after screenshot of every surface
where a logo appears** — loader, chart brand row, notification, exported screenshot —
checked against the PO's T-A baseline checklist. Stripping filters, sprite
consolidation and handler delegation, if they come later, are gated the same way.

**§4.6 — "a green suite only proves what it asserts."** Already live as GATE-01 and
today it drew blood: three order-ID rows sit `fixed` behind a green allocator gate
while the PO watched a trade ID change from #5 to #942 across a refresh. The gate
tests allocation; the failure is at restore.

**§4.4 first bullet — confirm production bundle.** Assigned to B. Every headline
figure must be from the production build: no development React, no StrictMode
double-render, no HMR.

## Part 3 — the preferences storm. Promoted, and it may close three things at once.

The advisor's hypothesis is that the design layer persists UI state on interaction, so
hover- and click-adjacent actions become writes, which against a 500-ing endpoint with
retries produces exactly the storm B found.

**B, one-minute check, do it first:** Network tab filtered to the preferences
endpoint, then hover the toolbar, toggle a setting, drag a panel. If requests fire on
interaction, it is confirmed.

If confirmed it explains why the endpoint is called so often, links the symbol,
timezone, pins, favourites and layout-restore failures to a single write path that may
originate in the design layer rather than the engine, and — per the advisor's third
consequence — may explain the nondeterministic document count, since panel construction
gated on a preferences response that sometimes fails would build a different number of
frames. **That is C's document staircase and B's 500 storm being the same defect.**
Test it directly: does document count correlate with whether that request settled
before init?

Fix shape if confirmed: coalesce and debounce to one write per settled change, never
write on hover, circuit-break on repeated failure.

## The cheap-check order — assigned

The advisor's Part 5, minus the two I eliminated statically, with owners.

| # | Check | Owner |
|---|---|---|
| 1 | Recalculate Style / Paint durations over 5s of replay, with invalidation reason on the largest event | C |
| 2 | Paint flashing while replay is PAUSED — anything repainting while idle is decorative | C |
| 3 | Network tab while hovering and toggling chrome (Part 3) | B, first |
| 4 | Listener count before/after opening and closing chrome windows and panels (D-14/D-15) | C |
| 5 | Layer count and churn in the Layers panel (D-3) | C |
| 6 | Production bundle confirmed; inline maps already cleared | B |
| 7 | Pointer-sweep profile across chart and order panel, watching what commits (§4.2) | A |
| 8 | DOM node count on a fresh single chart, and how many are icon SVG nodes (D-9) | C, already assigned |

§4.2 deserves emphasis. The dashboard campaign found a hover handler costing **31.5 ms
per pointer move**, fixed to 0.42 ms by render-scope isolation. The chart's design
layer has every precondition. A pointer sweep is a two-minute profile.

## Standing consequence

The V9 layer is a first-class suspect surface. When a mechanism is unclear, establish
whether the path originates in the integrated design layer before assuming product
code — **and equally, do not assume it does.** Two of my four checks this morning moved
suspicion *off* the design layer and onto the engine. Provenance is a prior, not a
verdict.
