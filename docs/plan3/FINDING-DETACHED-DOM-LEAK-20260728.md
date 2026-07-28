# FINDING — the memory leak is detached DOM, and it is already present at idle

**Opened:** 2026-07-28 14:00 by Director, on the PO's Test 2 heap snapshot pair.
**Status:** mechanism **NAMED**, holder **NOT YET NAMED** (retainer path still required).
**Evidence:** PO heap snapshots, Summary view, session 886. Snapshot 1 = **147 MB** (idle). Snapshot 2 = **161 MB** (after ~3 min replay + 4 indicators + 1 open order, reported as feeling laggy).

---

## 1. The finding

**Chrome is reporting tens of thousands of DOM nodes as `Detached`.** A detached node is one that has been **removed from the page but is still referenced by JavaScript**, so it can never be collected. Chrome labels these explicitly because they are the textbook signature of a DOM memory leak — this is not an inference we are drawing, it is the profiler's own classification.

| Constructor | Count (idle) | Retained | Share of heap |
|---|---|---|---|
| **`Detached <div>`** | **19,807** | **17,783 kB** | **12%** |
| `Detached blink::UniqueElementData` | 28,264 | 14,512 kB | 10% |
| `Detached blink::MutableCSSPropertyValueSet` | 24,325 | 11,100 kB | 7% |
| `Detached blink::HeapVectorBacking<CSSPropertyValue>` | 20,804 | 8,464 kB | 6% |
| `Detached SVGRectElement` | 2,214 | 3,037 kB | 2% |
| `Detached blink::ElementRareDataVector` | 23,444 | 2,793 kB | 2% |
| `Detached SVGAnimatedLength` | 22,488 | 2,329 kB | 2% |
| `Detached <span>` | 3,171 | 2,254 kB | 2% |
| `Detached blink::CSSValueList` | 28,859 | 1,930 kB | 1% |
| `Detached SVGSVGElement` | 1,306 | 1,838 kB | 1% |
| `Detached CSSStyleDeclaration` | 23,407 | 1,686 kB | 1% |
| `Detached SVGCircleElement` | 1,306 | 1,093 kB | 1% |
| `Detached Text` | 10,932 | 1,064 kB | 1% |
| `Detached blink::CSSNumericLiteralValue` | 43,055 | 1,033 kB | 1% |

**Retained sizes overlap** — a detached `<div>` retains its own `UniqueElementData`, style sets and children — **so these must not be summed**. The safe statement is the strongest one anyway: **`Detached <div>` alone is 12% of the heap, at 19,807 nodes**, and the detached families collectively dominate the non-code portion of it.

## 2. **The leak was already there before the test began.** This is the decisive observation.

Counts across the two snapshots:

| | Idle | After 3 min of loaded replay | Δ |
|---|---|---|---|
| `Detached <div>` | 19,807 | 19,811 | **+4** |
| `Detached blink::UniqueElementData` | 28,264 | 28,268 | **+4** |
| `Detached SVGRectElement` | 2,214 | 2,214 | **0** |
| `Detached SVGAnimatedLength` | 22,488 | 22,488 | **0** |
| `Detached <span>` | 3,171 | 3,171 | **0** |
| `Detached Text` | 10,932 | 10,934 | **+2** |

**The detached population did not grow during the activity. It was already at ~19,800 divs on a chart sitting idle.**

That reframes the whole memory row. **This is not a per-tick or per-order accumulation — it is a slow accretion over the session's lifetime**, which is exactly what the reclassified memory row predicted ("grows with tab lifetime, not stored data") and exactly why clearing browser data appeared to fix it: a fresh page load starts the count at zero.

**It also means the acceptance measurement must span a long session.** A 3-minute test cannot move this number and would report "no leak" on a build that leaks badly.

## 3. What *did* grow in three minutes — and one number that needs explaining

Heap went **147 MB → 161 MB (+14 MB)**.

| Constructor | Idle | After | Δ count |
|---|---|---|---|
| **`{t, o, h, l, c, v}`** (candle objects) | 272,675 | **348,201** | **+75,526** |
| `(number)` | 1,362,168 | 1,597,977 | +235,809 |
| **`(compiled code)`** | 111,864 | **141,747** | **+29,883** (+5,186 kB) |
| `(string)` | 84,676 | 89,445 | +4,769 |
| `Object` | 15,780 | 18,290 | +2,510 (+8,771 kB retained) |
| `Function` | 41,361 | 44,095 | +2,734 |
| `Array` | 30,067 | 31,190 | +1,123 (+6,441 kB retained) |
| `DrawingToolsManager` | *absent from top rows* | present, **5,593 kB retained** | — |

**Two of these want an explanation and neither has one yet:**

**`+75,526 candle objects in ~180 seconds` — about 420 per second.** A replay reveals bars one at a time; it cannot legitimately mint 420 candle objects a second. **The shape strongly suggests whole-array re-materialisation** — something rebuilding the candle set repeatedly rather than appending to it. **If that is right, this is the memory-side signature of A's resample ceiling**, seen from an independent instrument. Flagged as a hypothesis per BRIEF-02; it needs a retainer path and a count-per-tick before anyone acts on it.

**`+29,883 compiled-code objects, +5.2 MB`, from loading four indicators.** Compiled code growing means **new code being compiled at runtime**. Four indicators should compile once. Thirty thousand new code objects is not "once" and is worth its own look — it is also a plausible partial explanation for why the PO reports lag specifically when indicators are present.

## 4. Why this probably connects to the other monster

**A's `chart.js` missing-`removeEventListener` finding now has independent corroboration and a scale.** A listener left attached to a removed node keeps that node — and its entire subtree, styles and CSS objects — permanently alive. **That is precisely the mechanism that manufactures detached DOM**, and it is precisely the shape of the table in §1, where the divs come with tens of thousands of `UniqueElementData`, `MutableCSSPropertyValueSet` and `CSSValueList` objects in tow.

**And it links the two monsters, which I raised as a guess an hour ago and now has support:** the idle rAF loop performs DOM churn every frame — `removeChild`, `createElementNS`, `appendChild`, `replaceChildren`, `setAttribute` all appear in both idle CPU recordings, and GC cost roughly doubled per second between them. **If nodes are created and removed 60 times a second while listeners are never detached, the loop is the factory and the leak is the warehouse.**

**Stated as a hypothesis, not a finding.** What would confirm it: a retainer path from a detached `<div>` terminating in a listener registered on the loop's per-frame path. What would refute it: retainers pointing somewhere unrelated to rendering.

## 5. The one thing still missing, and it is what turns this into a fix

**We know what is leaking. We do not know who is holding it.** The PO's snapshots are Summary view with the `Retainers` pane empty, so the holder is unnamed — and **without the holder there is no fix, only a symptom.**

**Next PO action, 60 seconds of work:** in snapshot 1, expand **`Detached <div>`**, click any single instance, and screenshot the **`Retainers`** pane at the bottom. That pane names the chain of objects keeping it alive. **That screenshot is the difference between "we have a DOM leak somewhere" and "delete line N".**

Requested for `Detached <div>` first because it is the largest single row at 12%, and for `Detached SVGRectElement` second because SVG rects are chart-drawing primitives and their retainer will point straight at the responsible subsystem.

## 6. Rulings

**M-1. The memory acceptance criterion is a long session, not a short one.** §2 proves a 3-minute window cannot move the detached count. Acceptance is **detached-node count over a session of at least 30 minutes of realistic use**, compared before and after the fix. A short-window test would certify a leaking build as clean.

**M-2. `Detached <div>` count is the headline memory metric from now on**, in preference to total heap size. It is a count, so it is not confounded by legitimate data volume, and it is unambiguous — a detached node has no valid reason to exist.

**M-3. No memory fix is authored before a retainer path is in hand.** We have twice this week acted on a plausible memory mechanism and been wrong. The retainer path is cheap, decisive, and available for the asking.

**M-4. Storage remains refuted.** 582 kB of client storage against a 147 MB heap with 19,807 detached nodes. **The problem was always in memory, never on disk**, and this closes that thread permanently.

---

## 7. The leaked elements are now identified by their own HTML (PO expanded view, 14:04)

Expanding `Detached <div>` ×19,811 shows the elements'' serialised inline styles. **Distinct families, in descending count:**

| Family | Inline style (as serialised) | Distance | Retained ea. | Count |
|---|---|---|---|---|
| **28 px square, flex-centred** | `width: 28px; height: 28px; display: flex; align-items: center; justify-content: center…` | 10 | 1.9 kB | **the overwhelming majority** |
| Progress-bar fill | `width: 100%; height: 100%; background: rgb(0, 212, 161); transition: width 0.…` | 10 | 1.9 kB | scattered, regular |
| Left-accent container | `border-width: 1px 1px 1px 3px; border-style: solid; border-color: rgba(140, 1…` | 13 | 2.6–2.9 kB | few |
| Flex row with gap | `display: flex; align-items: center; justify-content: center; gap: 7px; height…` | 10 | 2.8 kB | few |
| **Toast message** | `class="tlr-toast-stack-msg" role="status" style="background: rgb(15, 17, 25)…` | 7 | 4.6–5.1 kB | **2** |

**A 28×28 flex-centred square is an icon or icon-button container. `rgb(0, 212, 161)` with `transition: width` is a progress-bar fill.** Together with the accent container and the gapped flex row, this reads as a repeatedly-constructed control cluster — icon buttons plus a progress indicator — being created and discarded in bulk.

### 7.1 One verified contributor: `talaria-toast-stack.js`, and it is NOT the main one

`tlr-toast-stack-msg` with `role="status"` locates to `chart v 1.4/chart/modules/talaria-toast-stack.js` (324 lines). **Two retention candidates, both verified by reading:**

- **`const pinned = new Map()` (`:17`)** holds `{el, …}` rows keyed by string. `remove(el)` (`:304-316`) does delete from the Map before removing the node, so the *documented* path is clean — but **any element that enters `pinned` and is removed by some other route stays referenced by the Map forever.**
- **`root.addEventListener('resize', scheduleRelayout)` and `root.addEventListener('scroll', scheduleRelayout, true)` (`:320-321`) are registered at module scope and never removed.** `scheduleRelayout` closes over `pinned` and the transient row array, so these two listeners keep the entire toast bookkeeping alive for the lifetime of the page.

**Scale check, and it is why this is a footnote rather than the answer: only 2 detached toast messages appear.** The toast module cannot account for 19,811 divs. **Its own construction path contains no 28 px square and no progress bar** — I read the element builder (`:255-301`): a `wrap`, one absolutely-positioned 3 px `stripe`, and a text node. **So the dominant family comes from a different component.**

### 7.2 ⚠️ I have NOT identified the source of the 28 px family, and I am not guessing

I searched `chart.js`, `settings-panel.js`, `drawing-tools-ui.js`, `drawing-toolbar.js`, `indicator-ui.js`, `screenshot-manager.js`, `panel-managerv2.js` and `chart-window-limit.js`. **Every `28px` hit is either a CSS rule in a stylesheet block or a `height:28px` with `width:auto` — none is an inline `width: 28px; height: 28px` on a `div`.** The leaked elements carry *inline* styles, so a CSS-class match is not the producer.

**Assigned to A as a bounded search rather than answered by me.** I have spent the day rejecting managers'' unverified assertions and will not add one. **The search keys are exact and unusually strong** — an element serialising to `width: 28px; height: 28px; display: flex; align-items: center; justify-content: center` and a sibling serialising to `width: 100%; height: 100%; background: rgb(0, 212, 161); transition: width`. Likely constructed via `cssText`, `Object.assign(el.style, …)` or a template literal, which is why a plain `28px` grep misses it.

**This search becomes unnecessary the moment the retainer path arrives** — the retainer names the holder directly, and the holder identifies the component without any guessing. **The retainer pane remains the highest-value 60 seconds available.**

### 7.3 What this changes

**Nothing in §1–§6 is affected.** The count, the idle-presence conclusion, and rulings M-1 through M-4 stand on the snapshot pair and are independent of which component builds the elements.

**One refinement to the hypothesis in §4:** the leaked families are **HTML controls — icon buttons and progress bars — not canvas or chart primitives.** The idle loop''s per-frame churn includes `createElementNS`, which is **SVG**, so the `Detached SVGRectElement` / `SVGAnimatedLength` / `SVGSVGElement` rows are the ones plausibly attributable to it. **The 28 px HTML squares are more likely a UI-panel lifecycle defect than a render-loop artefact** — which would mean **two independent leaks, not one.** Hypothesis, per BRIEF-02.

---

## 8. RETAINER PATHS RESOLVED (PO, 14:12) — the leak is whole detached DOCUMENTS retained by React roots

**This supersedes §7.2 and my "icon-button lifecycle" framing. I was wrong about the scale and the kind.** The 28 px squares are not the leak; they are merely the most numerous element *inside* the leak.

### 8.1 What the retainer chains show

Selecting a single 28 px div and expanding its retainers gives a chain in which **every link is itself `Detached`**:

```
Detached <div style="width: 28px; height: 28px; …">
  ← [16] in Detached SVGSVGElement @122425
  ← [160] in Detached blink::HeapHashTableBacking<…SVGSVGElement…>
  ← [2]  in Detached blink::SVGDocumentExtensions @74326
  ← [47] in Detached HTMLDocument @7042015
  ← [5]  in Detached Window @9668347
  ← global_proxy_object in system / NativeContext @78560
  ← (Micro tasks) → (GC roots)
```

**`Detached Window` and `Detached HTMLDocument` are the finding.** A detached `Window`/`Document` is an entire browsing context that was torn down but is still referenced — **and retaining a document retains every node inside it.** That is where 19,811 divs come from: not 19,811 leaked buttons, but a handful of leaked *pages*.

**At least four distinct leaked documents are visible** — `HTMLDocument` `@7042015`, `@7042013`, `@7042042`, `@7042073` — alongside `Detached <html lang="ar" dir="rtl">` **and** `Detached <html lang="ar" dir="ltr">`, i.e. leaked root elements in two different text directions.

### 8.2 The retaining root is a React root that was never unmounted

The most specific named link in any chain is:

```
containerInfo in ce @5000775
```

**`containerInfo` is the property React stores on a `FiberRoot`, pointing at the DOM container it renders into.** A `FiberRoot` retains its whole fiber tree and every DOM node associated with it. **So a React root exists whose container has been removed from the page and which was never unmounted** — and it is holding a complete document tree alive.

The retainer set for one element offers **`Show all 39,293`**.

### 8.3 The leaked documents are the app shell, not the chart

The markup inside them identifies the owner unambiguously:

- `class="tlr-session-nav-item" role="button"`, `tlr-session-nav-rail`, `tlr-session-nav-spacer`, `tlr-scroll`
- `<body class="__variable_200ed2 font-sans antialiased">` — **`__variable_` is Next.js font optimisation**
- `<link rel="preload" href="https://www.googletagmanager.com/gtag/js?id=G-2SBB19HFJE" as="script">`
- `<meta name="application-name" content="talaria-log">`
- dozens of `Detached CSSTransition` objects

**This is the Next.js application shell** — the session navigation rail and page chrome — **not `chart.js` and not the canvas.** The 28 px squares are nav-rail icon buttons (`background: rgba(255,255,255,0.07); border: 1px solid rgba(140,160,255,0.05)`).

### 8.4 What is established, and what is not

**Established by the PO''s snapshot, no inference required:** multiple `Detached HTMLDocument` and `Detached Window` objects coexist in one heap; a React `FiberRoot.containerInfo` appears in the retaining chain; the leaked documents contain app-shell markup; every link from the leaked div up to the native context is itself detached.

**NOT established, and not to be acted on yet (BRIEF-02):** *why* the roots survive. The two candidates are **client-side navigation** (each Next.js route change leaving an unmounted root) and **language/direction switching** — the two `<html>` elements differ only in `dir`, which is suggestive of the second, and the Arabic `lang="ar"` on both is consistent with a locale toggle. **A third possibility is that the chart is iframed inside the shell and panel teardown orphans the frame''s document.** These are distinguishable by one experiment and must not be guessed at.

### 8.5 Consequences — three of them, and each changes a decision

**1. My §7.2 assignment to A is WITHDRAWN.** I sent A to hunt for the code that constructs 28 px divs. **That search would have found a nav-rail component and taught us nothing**, because the elements are innocent — the document holding them is the defect. **Cancel it before A spends time on it.**

**2. Ownership: this is not in any manager''s territory.** The defect is in the Next.js application shell. `TERRITORY.yml:295` records `homepage` outside `chart` as **RED for every manager by fail-closed default** — **the same structural hole that left the backend trade-loss path unowned for hours today.** That is now twice in one day that the highest-value finding landed in unowned ground. **A grant is required before any fix, and the territory model needs a standing answer rather than a third ad-hoc grant.**

**3. It explains the multichart residue directly.** The PO''s original complaint — a single chart staying slow *after* a multichart session, and lag surviving a return to 1x — is exactly what leaked documents produce. **Teardown residue and this leak are very likely one row, not two.** Test 3 becomes a confirmation rather than an exploration: if the detached document count rises by one per multichart open/close cycle, the mechanism is settled.

### 8.6 Ruling M-5 — the metric changes again

**`Detached HTMLDocument` and `Detached Window` counts are now the headline memory metrics, above `Detached <div>`.** Rationale: a detached document is a **single, unambiguous, low-cardinality** defect — the correct value is exactly zero, it cannot be confounded by legitimate data volume, and **one leaked document accounts for thousands of leaked nodes**, so the div count is a downstream symptom that will move on its own once the document count does.

**Acceptance: zero detached documents after a session involving navigation, language switching, and multichart open/close.** M-1''s 30-minute-session requirement stands and is now easier to satisfy, because document count is countable rather than statistical.
