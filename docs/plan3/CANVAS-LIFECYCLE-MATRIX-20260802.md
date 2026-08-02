# Canvas lifecycle matrix — publish before any fix

**2 August 2026 · Manager A · inventory only, no product change in this packet**

Director ask: audit every canvas creation site for release on **pair switch**, **panel removal**, **destroy**, or **never**. Publish the matrix so rows can be split between A and E without collision. Price candidates by **total private + GPU delta after forced collection**, not backing-store MB (E's indicator-layer win: −3.04 MB backing → **−61.52 MB** private / **−36.74 MB** GPU).

E already owns: text-measure canvases, `clipPath` defs, deep allocator attribution (`partition_alloc` / `malloc`). Those are marked **E-reserved** below and are not claimed by A.

---

## 1. How the “42 / eight files” figure reconciles

| Count | What |
|---:|---|
| **19** | Unique `document.createElement('canvas')` sites in the canonical authoring tree (`chart v 1.4/chart/modules/`, harness excluded) |
| **19** | Homepage mirror of the same 19 (byte-parity obligation; not a second product) |
| **4** | Declarative `#chartCanvas` shells that host the live chart surface |
| **42** | 19 + 19 + 4 — matches the Director’s figure when both trees are counted |

Unique **logical** sites to allocate work against: **23** (19 createElement + 4 shells).  
Unique **modules with createElement**: **7** files. With the V9 shell (`TalariaV8bLive.jsx`) as the eighth surface file, the “eight files” reading also lands.

Excluded from the 42: harness (`m21-2-browser-harness`), `drawing-tools-ui.js.bak`, `dist-v9` build copies, tests.  
No `new OffscreenCanvas(...)` in product code (M21-2 only transfers an existing canvas).

---

## 2. Pricing rule (mandatory)

| Metric | Use? |
|---|---|
| `canvas.width * canvas.height * 4` / `canvasBackingMB` | **Broken for prioritisation** — under-reads true cost ~20× |
| Total private Δ after forced collection | **Primary** |
| GPU private Δ after forced collection | **Primary (co-equal)** |
| Renderer private Δ | Supporting |
| Node counts / detached-node counts | Not pricing |

Instrument pattern: E’s `scripts/arena-reclaim-measure.mjs` / ind-layer arena evidence. Quote before/after on **one** build; do not add independently measured wins.

---

## 3. Lifecycle legend

| Code | Meaning |
|---|---|
| **Y** | Explicit release on that event (`width=0`/`height=0` and/or nulling refs / DOM remove) |
| **N** | No release on that event |
| **n/a** | Site is not retained across the event (ephemeral local) — but see “GC-only” |
| **GC-only** | No explicit zeroing; relies on dropping the JS reference. GPU/compositor cost may outlive the local until collection — **unpriced** until measured |
| **latent** | Create site exists but is not on the V9 serve path today |

---

## 4. Matrix — unique logical sites

### A. Retained / session-scoped (highest matrix value)

| ID | File:line | Kind | Purpose | Pair switch | Panel removal | Destroy | Notes / owner hint |
|---|---|---|---|---|---|---|---|
| C01 | `chart-indicators-full.js:8566` | indicator layer | `_indLayerCanvas` HiDPI cache | **Y** (E `8d0ed5579`) | iframe death → destroy path | **Y** (`chart.js` destroy zeros) | **DONE by E** (−61.5 MB private). Host recreates one layer after switch (steady, not per-paint). Residual open if host layer still priced high. |
| C02 | `compare-overlay.js:1207` | compare pane | linked-pane canvas per compare id | **N** — measured, and **correctly so** | **Y** `_releaseLinkedPaneResources` | via pane teardown | **CLOSED 21:45.** Pair switch does not walk the panes, but it does not *invalidate* them either: a pane is user-created state naming another instrument, not a derived cache. Cost of four panes is **+10.3 MB** total private, not fifty. E's **−53.72 MB** does not replicate — see BOARD-A 21:45. |
| C03 | `panel-managerv2.js:1930` | main (legacy panel) | `panelCanvas${index}` | **N** observed | DOM remove only; **no** `width=0` at create site | **N** explicit | **latent** — not loaded by dist-v9 / chart-embed. Hygiene if that shell returns. |
| C04 | `TalariaV8bLive.jsx:37249` | main chart | V9 `#chartCanvas` | **N** (same element reused) | iframe/`destroy` | **Y** `chart.js` `this.canvas.width=0` | Not recreated on pair switch. Cost is residency of the live surface, not abandon-on-switch. |
| C05 | `multichart-prod/chart-embed.html:387` | main chart | per-iframe `#chartCanvas` | **N** (reuse) | **Y** iframe remove → Chart destroy | **Y** | Four panels ⇒ four live surfaces. Panel removal is the release event. |
| C06 | `multichart/chart-host.html:198` | main chart | older host `#chartCanvas` | **N** | iframe/`destroy` | **Y** | Same pattern as C05; GATE-01 shell. |
| C07 | `legacy-index.html:43027` | main chart | legacy monolith `#chartCanvas` | **N** | n/a (no multichart) | **Y** | Homepage copy is `status=removed`; source retained. |

### B. Screenshot / scratch (ephemeral, release uneven)

| ID | File:line | Kind | Purpose | Pair switch | Panel removal | Destroy | Explicit zero? |
|---|---|---|---|---|---|---|---|
| C08 | `order-manager.js:10875` | screenshot | journal thumb JPEG (`_m20J1RasterizeThumb`) | n/a | n/a | n/a | **Y** — `width=0` immediately after `toDataURL` |
| C09 | `screenshot-manager.js:262` | scratch | brand-logo alpha bounds | n/a | n/a | n/a | **Y** — `_releaseScratchCanvas` after `getImageData` (landed 21:55) |
| C10 | `screenshot-manager.js:1385` | scratch | `captureCanvasDirect` composite | n/a | n/a | n/a | **Y at the `captureChartSnapshot` consumer** (landed 21:55). Interactive `download`/`copy`/`link`/`tab`/`preview` consumers deliberately left alone — they still read the canvas after the call returns |
| C11 | `screenshot-manager.js:1474` | scratch | `captureMultichartComposite` | n/a | n/a | n/a | **Y** — each per-panel scratch right after it is composited, 4 per capture at four panels (landed 21:55) |
| C12 | `drawing-tools-ui.js:13819` | scratch | image-tool upload compress | n/a | n/a | n/a | **Y** — after `toDataURL` (landed 21:55) |

### C. Text-measure (E-reserved — do not take)

All in `drawing-tools-text.js`. Created inside render/measure helpers, never assigned to `this.*`, never zeroed.

| ID | Line | Owner function | Pair / panel / destroy | Explicit zero? |
|---|---:|---|---|---|
| C13 | 466 | `measurePlainTextLineWidth` | n/a / n/a / n/a | **N** GC-only |
| C14 | 700 | `measurePlainTextBlockWidth` | n/a | **N** GC-only |
| C15 | 1128 | `TextTool.wrapTextLines` | n/a | **N** GC-only |
| C16 | 1869 | `NoteBoxTool.render` | n/a | **N** GC-only |
| C17 | 2336 | `AnchoredTextTool.render` | n/a | **N** GC-only |
| C18 | 2719 | `NoteTool.render` | n/a | **N** GC-only |
| C19 | 3204 | `PriceNoteTool.render` | n/a | **N** GC-only |
| C20 | 3353 | `PinTool.render` | n/a | **N** GC-only |
| C21 | 3974 | `CalloutTool.render` | n/a | **N** GC-only |
| C22 | 4338 | `CommentTool.render` | n/a | **N** GC-only |
| C23 | 5110 | `Signpost2Tool.render` | n/a | **N** GC-only |

**E-reserved.** Hot-path recreation; price with private+GPU after forced collection under a text-heavy replay, not by counting creates.

`clipPath` defs are **not canvas sites** (SVG). Listed here only as E-reserved adjacency so A does not open that row: unbounded `defs`/`clipPath` append (see prior monster-1 notes). Out of this matrix’s createElement census.

---

## 5. Summary by release behaviour (unique logical sites)

| Behaviour | IDs | Count |
|---|---|---:|
| Releases on pair switch | C01 (landed) | 1 |
| Releases on panel removal / pane teardown | C02, C05 (iframe destroy) | 2+ |
| Releases on Chart.destroy only (not pair switch) | C04, C06, C07; C01 also | main surfaces |
| Explicit immediate zero (scratch) | C08, **C09–C12 (landed 21:55)** | 5 |
| GC-only ephemeral | C13–C23 (E-reserved) | 11 |
| Latent / not on V9 path | C03 | 1 |

**The structural lesson from C01:** the expensive class is **retained canvases that survive pair switch**. Destroy-only release is how a constantly switching session keeps paying GPU×N.

---

## 6. Allocation proposals (no claims taken — Director assigns)

Price before build. Backing MB is disqualifying as a sort key.

| Priority | Candidate | Why | Suggested owner |
|---:|---|---|---|
| — | C01 residual host layer after pair switch | E already landed the release; host recreates one layer (measured steady). Only reopen if private+GPU still shows a host-sized abandoned layer. | E (residual of own win) |
| 1 | C13–C23 text-measure hot path | Advisor queue; 11 sites; GC-only; rides on every text tool paint | **E (already owned)** |
| 2 | `clipPath` defs reclaim | Advisor queue; not canvas; unbounded append | **E (already owned)** |
| 3 | C02 compare linked-pane × pair switch | Pane teardown releases; unclear whether main-symbol pair switch walks every pane. Reprice on pair-switch event. | A or E — **needs assignment** |
| 4 | C09–C12 screenshot/scratch zeroing | Cheap hygiene (`width=0` before drop); likely small vs C01 but unpriced | A candidate if E is in allocators |
| 5 | C03 panel-managerv2 | Latent; only if that shell is revived | defer |
| 6 | C04/C05 live main surfaces | Not “forgotten release on switch” — they are the live display. Attribution belongs in GPU/renderer census, not a zero-on-switch patch. | C/E arena work |

**A will not start fixes until this matrix is allocated.** Collision risk is real on text-measure and clipPath.

---

## 7. What this packet is not

- Not a fix to any site  
- Not a private/GPU price list (pricing is the next step for assigned rows)  
- Not a claim that 23 unique sites are “fewer than 42 problems” — mirrors must stay in lockstep; a fix that lands on one tree only is another vacuous green  

Evidence pointers: advisor report `docs/plan3/ADVISOR-REPORT-THE-MEMORY-WAS-NEVER-IN-JAVASCRIPT-20260802-2050.md` §5; E commit `8d0ed5579`; arena instruments under `_evidence/manager-E/`.
