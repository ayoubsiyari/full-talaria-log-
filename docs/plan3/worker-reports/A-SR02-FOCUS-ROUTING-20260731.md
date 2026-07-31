# SR-02 — engine-side focus routing classification + panel resize propagation

**2026-07-31** · Manager A · packet `A-SR02-FOCUS-ROUTING-V1`
**Base** `79625eac6` · **Branch** `manager-a/focus-routing-20260731` · worktree `manager-a-focus-routing`

Held the `chart.js` single-writer token. Both mirrors edited identically and verified byte-identical.

---

## 1. Four-way classification — THE DELIVERABLE

Booted path = `chart.js` plus every module loaded by the two **shipping** shells
(`dist-v9/index.html`, `multichart-prod/chart-embed.html`) — 60 files, no parse failures.

Counted by AST, not by text. Text matching inflates: `window.chartWindowLimit` and
`window.chartIndicators` match `/window\.chart/`, and comments and string literals
containing the words are counted too. `chart-regression-smoke.js` has **4 text hits and
0 real references**.

**199 raw AST nodes, which are only 155 logical decisions.** 39 source lines carry a
guard-plus-use pair (`window.chart && window.chart.orderManager`) that a node count
double-counts. The logical figure is the one that prices the work.

| Bucket | Logical sites | Raw AST nodes |
|---|---|---|
| **the host chart** | **58** | 73 |
| **the focused instance** | **37** | 52 |
| **ambiguous** | **36** | 41 |
| **my instance** | **24** | 33 |
| total | **155** | **199** |

### The finding that changes the price

**The premise that these 199 references "bypass the seam entirely" is wrong.** Two
measured properties dominate:

1. **33 raw nodes are already instance-preferring guarded fallbacks.** The dominant
   module idiom is

   ```js
   const chart = this.chart || (typeof window !== 'undefined' ? window.chart : null);
   ```

   `window.chart` is a *last-resort fallback behind an owning reference*. In multichart
   the `this.chart` arm wins, so these are not routing defects and converting them
   changes no behaviour. `drawing-tools-advanced.js:1012/1027/1042` and
   `drawing-tools-ui.js:639` are the canonical shapes.

2. **58 logical sites mean the host on purpose.** `window.chart !== this`,
   `window.chart.orderManager`, `window.chart.settingsModal`. Panels are *documented* to
   share the host's order and replay systems (`chart.js:1604-1608`, "Panels will
   reference the main chart's replay and order systems"). **Converting these to `this`
   would break panel→host sharing**, not fix routing.

So **82 of 155 logical sites (53%) must not be routed through the seam at all.** The
genuine seam surface is 37 confirmed plus at most 36 ambiguous.

Full per-site output with a `why` for every site:
`docs/plan3/evidence/A-SR02-FOCUS-ROUTING-20260731/window-chart-classification.json`.

### What I converted: NOTHING. Deliberately.

I converted **zero** sites, and that is the correct outcome rather than a shortfall:

- The 24 "my instance" sites are already instance-preferring. Converting them is
  cosmetic, touches the hottest file in the repo, and buys no behaviour.
- The 58 "host chart" sites must stay.
- The 37 "focused instance" sites **cannot be converted usefully yet**, because the only
  provider the shipping shell installs is a singleton shim (§3). Routing them through
  `getActiveChart()` today would resolve to `window.chart` — the same object — while
  adding a call layer and the appearance of a fix. That is the "green check that
  exercises nothing" failure in product form.
- The 36 ambiguous sites need your decisions first.

**The codemod could not be reused as claimed.** `scripts/sr01/` is file-agnostic but
**transformation-specific**: `sr01-thisreach.mjs` hardcodes `getElementById` as the
matcher and the class name `OrderManager` (line 17), and `sr01-verify-ast.mjs` hardcodes
the `_omEl`/`_omOn`/`_omQs` inverse rewrites. Its `window.chart` handling is a single
raw-text tally in `sr01-census.mjs:24`. I reused the **method**: the parent-stack `this`
binding computation is carried over verbatim into `scripts/sr02/sr02-census.mjs`
(`bindingOf`), with attribution. The AST-identity verifier was not needed because I
landed no rewrite.

`indicator-ui.js` — the stated codemod limit is real: 7 sites, all `MODULE`/
`INNER_FUNCTION` bound, no classes, so no `this` to convert to.

---

## 2. RESIZE-01 — real defect, fix landed

### Mechanism, pinned

`chart.js:1570` registers `window.addEventListener('resize', this._handleViewportRefresh)`
inside the `if (!this.isPanel)` block opened at **1508** (not at 1570), whose `else` arm at
1575 begins "For panels, …". The handler closures themselves (1540-1568) are also defined
inside that arm, so for a panel they do not exist at all.

The panel side has a `ResizeObserver` — `multichart-prod/embed-bridge.js:866-882` — but its
callback (`scheduleMcRedraw`, 832-864) only calls `ch.drawingManager.redrawAll()`. It
**never calls `ch.resize()`**, and `canvas.width`/`canvas.height` are only ever assigned
inside `Chart.resize()`. So a panel's backing store is never rebuilt on a viewport change.
That is exactly the measured symptom: CSS box 791×849 → 449×700, backing store stayed
791×849.

Confirmed independently: `chart.js` contains **one** window resize listener and **zero**
`ResizeObserver`s.

### The fix

`chart.js` +44/-1, identically in both mirrors. Adds a panel-only registration after the
existing `isPanel` if/else, with the handler mirroring the host's layout-drag suppression
and rAF coalescing, then calling `this.resize()` and `this.scheduleRender()`.

### It is inert in both shipping modes — verified, not assumed

`isPanel` is `true` **iff a canvas element is passed to the constructor**
(`chart.js:982-988`). Every `new Chart(` site in the tree:

| Site | Form | `isPanel` |
|---|---|---|
| `chart.js:42912` | `new Chart()` — the bootstrap both shipping shells use | **false** |
| `legacy-index.html:47588` | `new Chart(panel.canvas, panel.svg, {panelIndex})` | **true** |

So single-chart mode (`dist-v9`) and iframe-multichart (`chart-embed.html`, one chart per
iframe realm) both construct with `isPanel === false` and **never enter the new block**.
Behaviour in today's two shipping modes is identical because the code is unreachable there.

Stated plainly, as required: this **is** a scoping change that is inert until a host opts
in. It becomes active for same-realm secondary instances — which is what SR-02 is
preparing for — and for `legacy-index.html`'s multi-panel path, where it fixes the defect.
`legacy-index.html` is not in either shipping shell's module set.

### Container vs window resize

Kept distinct, as warned. Container resize already reaches `Chart.resize()` directly; this
adds only the missing window route. `Chart.resize()` early-returns at **19643-19645**
unless `sizeChanged || dprChanged || bufMismatch`, so the new listener is a no-op when
nothing moved. **Every resize in the harness changes real dimensions**, and a dedicated
cell (`RESIZE-NOOP-MEASURES-NOTHING`) fails if a same-size event ever does work.

> Correction to the brief: the early-return has **three** triggers, not just dimension
> change. `bufMismatch` means a same-size event *can* legitimately do work when the
> backing store is already mismatched. Worth knowing before anyone writes a resize test.

---

## 3. The seam — your correction verified, with one addition

All three provider claims hold. Line numbers drifted in one:

| Claim | Verdict |
|---|---|
| `dist-v9/index.html:1837-1842` singleton shim | **Correct, line drift**: install is **1840-1843**; 1837 is the comment that calls it a "compatibility shim" |
| `chart-embed.html:445-446` same shim | **Exact** |
| `MultichartGrid.jsx:7081-7087` focus-aware | **Correct, extends further**: the function body runs to **7091** |

**Addition you did not have:** `MultichartGrid.jsx:7223` and `:7226` are an *uninstall*
path — on unmount it restores the previous provider, or reinstalls the singleton shim.
Any provider design has to survive that teardown, so the focus-aware provider is not
merely absent from the shipping shell, it is *removable at runtime*.

**No provider exists in the engine — proven, not asserted.** Zero installers across
`chart.js` + 69 modules; the same matcher returns 5 hits on the shells and the React file,
so the empty result is a measurement rather than a broken search.

> **Instrument error I made and caught.** My first matcher was
> `/window\.getActiveChart\s*=/`, which also matches `window.getActiveChart === 'function'`
> — a *typeof test by a consumer*. It reported providers inside `chart.js` and
> `compare-overlay.js` that do not exist. Fixed with a negative lookahead `=(?!=)`. Anyone
> auditing this seam with a naive `=` matcher will get the same false positives.

### Ownership — your claim is right

`talaria-design/vite.config.live.js:142-143` is exact: `outDir:
path.resolve(__dirname, '../chart/dist-v9')` with `emptyOutDir: true`. `dist-v9/assets/talaria-v9-live.js`
exists on disk at 1.7 MB. `dist-v9/**` is build output and would be destroyed by the next
build; `talaria-design/**` is its source project. **Both left untouched.** The provider is
designed and routed here, not landed.

---

## 4. E's controls — insufficient as a gate; extended, not replaced

Found at `083b87371` (and a later `922b78365`, "assert focus routing coordinate
correctness", which adds the `FOCUS-MOUSE-WRONG-RECT` cell for exactly the coordinate
concern in the brief). **Neither commit is an ancestor of base `79625eac6`** — I brought
the files in.

**They cannot go GREEN by fixing anything, because they are already GREEN.** Measured on
the completely unmodified base: `status: GREEN`, **exit 0**, all 5 RED controls and both
GREEN controls passing. The script reads no product source; every route is a hand-written
model function (`routeKeyboard`, `routeMouse`), and its own `limitation` field says so:
*"Model behavior oracle; wire into real single-realm input routing and Chart.destroy once A
lands product code."*

E's suite is a good **specification** — its coordinate cell encodes precisely the point
that routing the event to the right instance while resolving against the wrong rect is not
a fix. It is not a **gate**. Extended per instruction, in
`scripts/sr02/sr02-focus-seam-controls.mjs`, which imports and re-runs E's oracle verbatim
and adds five source-bound cells asserting facts about the real providers on disk,
including a positive control on its own matcher. All GREEN.

---

## 5. GATE-01 — RED demonstrated on the base, then GREEN

RED was **run**, not asserted, against the pristine base blob
`9ce24948b20d678fb3b88050dea114865d25319a`, extracted with `git cat-file` and hash-verified
identical to the pre-edit mirror (`193AABB6…`).

```
node sr02-resize-harness.mjs base-chart.js   →  status RED, exit 1
node sr02-resize-harness.mjs <fixed chart.js> →  status GREEN, exit 0
```

On base the harness reports the defect in its own words:

```json
"registrations": [ { "line": 1570, "hostOnly": true, "reachableForPanels": false,
                     "handler": "this._handleViewportRefresh" } ],
"panelResizeRegistered": false, "switchReadPresent": false
```
```
RESIZE-PANEL-BACKING-STORE-REFLOWS  RED
  "panel CSS box reflowed 791x849 -> 449x700 but backing store stayed 791x849"
```

| Cell | Base | After fix |
|---|---|---|
| `RESIZE-PANEL-LISTENER-REGISTERED` | RED | GREEN |
| `RESIZE-PANEL-BACKING-STORE-REFLOWS` | RED | GREEN |
| `RESIZE-NOOP-MEASURES-NOTHING` | GREEN | GREEN |
| `RESIZE-CONTAINER-ROUTE-UNCHANGED` | GREEN | GREEN |
| `KILLSWITCH-TRUTHY-DISABLES` | RED | GREEN |
| `KILLSWITCH-FALSY-KEEPS-FIX` | RED | GREEN |
| `FLAG02-MIDSESSION-FLIP-NO-RELOAD` | RED | GREEN |
| `FLAG03-OFF-ARM-IS-A-WORKING-PRODUCT` | GREEN | GREEN |

The two cells GREEN on base are honest: the no-op cell and the OFF arm describe properties
the base already has, and the base *is* the OFF arm. They are anti-regression cells, and
mutant M3 proves the no-op cell has teeth.

### Kill-switch

One switch, `window.__TALARIA_DISABLE_PANEL_VIEWPORT_RESIZE_V1`, read **inside the handler
on every call**, truthy-disabling. Driven as required:

- disabling: `1`, `'yes'`, `'true'`, `{}`, `[]`, `'0'` — all 6 disable
- keeping: `undefined`, `null`, `false`, `0`, `''`, `NaN` — all 6 keep the fix

`'0'` is the trap and it disables correctly, as a truthy string. The harness also fails the
build outright if a `=== true` / `!== true` comparison ever appears against this switch.

**FLAG-02** is exercised on a live instance across three phases with no re-registration:
active at 600×500, flipped ON mid-run (frozen at 600×500 through a 449×700 change), flipped
back OFF (catches up to 449×700), listener count unchanged throughout.

**FLAG-03** asserts a working product with the fix disabled, not an inactive feature:
mouse coordinates resolve against the panel's own rect (`clientX 3169 − left 1981 = 1188`,
matching the sibling lane's `A.mouseX = 1188` and never the `-793` wrong-rect value),
crosshair tracks, keyboard is delivered, the container-resize route still works, and the
host's own resize is unaffected.

---

## 6. Mutants — 5 applied to both mirrors on disk, 5 killed

| Mutant | Named killing cell(s) | Result |
|---|---|---|
| `M1-DROP-PANEL-RESIZE-REGISTRATION` | `RESIZE-PANEL-LISTENER-REGISTERED`, `RESIZE-PANEL-BACKING-STORE-REFLOWS` | KILLED |
| `M2-SWITCH-STRICT-EQUALS-TRUE` | `KILLSWITCH-TRUTHY-DISABLES` | KILLED |
| `M3-DEFEAT-RESIZE-EARLY-RETURN` | `RESIZE-NOOP-MEASURES-NOTHING` | KILLED |
| `M4-MOVE-REGISTRATION-UNDER-HOST-ARM` | `RESIZE-PANEL-LISTENER-REGISTERED`, `RESIZE-PANEL-BACKING-STORE-REFLOWS` | KILLED |
| `M5-HOIST-SWITCH-READ-OUT-OF-HANDLER` | `KILLSWITCH-TRUTHY-DISABLES`, `FLAG02-MIDSESSION-FLIP-NO-RELOAD` | KILLED |

Every mutant applied to **both** mirrors, mutated mirrors verified identical to each other,
files restored and SHA-256-verified against the pre-mutation digest after each one, suite
re-confirmed GREEN after the last restore.

**Two mutants exposed real holes in my own harness before it was trusted:**

- **M4 initially would have survived.** My reachability test matched only the bare
  `UnaryExpression` `!this.isPanel`, so moving the guard to `!this.isPanel && …` — a
  `LogicalExpression` — went undetected. Fixed by decomposing `&&` conjunctions.
- **M3 did survive the first run.** My early-return check was `src.includes('!sizeChanged
  && !dprChanged && !bufMismatch')`, and the mutant `if (false && !sizeChanged && …)`
  leaves that substring intact. Worse, the simulation's `resize()` was hardcoded rather
  than wired to source, so defeating the guard in `chart.js` changed nothing. Fixed by
  decomposing the predicate by AST and requiring exactly the three expected negations, and
  by wiring the simulation's early-return to that extracted fact.

**NOT_APPLIED is proven to fire**, not merely coded: with `SR02_MUTANT_STALE_CONTROL=1` a
mutant carrying a deliberately absent needle is reported `NOT_APPLIED` / `FAIL` with a loud
banner and exit 1.

---

## 7. Mirror hashes

| | `chart v 1.4/chart/chart.js` | `homepage/public/chart/chart.js` |
|---|---|---|
| before | `193AABB6FC2B2D7A7845B9FB4EC607BE7C7B94966C3795C38BFDB95143E03D21` | identical |
| after | `5473FF43374E4C14F21B28D0A516412D83EFDFCBD167B5B4251F5E95B1B823B4` | identical |

Base blob oid `9ce24948b20d678fb3b88050dea114865d25319a` for both. Diff is +44/-1 on each.
No `chart/modules/*.js` touched, so no module mirrors are in scope.

---

## 8. Revised hours for the remaining routing work

Previous range 65–170 h, spread attributed to the unknown classification. Classification is
now known, and it removes most of the upper half.

| Item | Basis | Hours |
|---|---|---|
| Triage the 36 ambiguous sites with an owner | ~15 min each | 9 |
| Convert the 37 "focused instance" sites | they collapse to ~12 distinct idioms (24 of them are one `?.drawingManager \|\| window.drawingManager` shape; 9 are one timezone block in `chart-indicators-full.js`) — 12 × 3 h design/convert/test, plus 37 × 0.3 h per-site verification | 47 |
| Coordinate-resolution correctness | the actual risk: every converted site reading pointer state must resolve against the right rect | 15 |
| Gates and mutants for the conversion | pattern now established by this packet | 12 |
| Optional tidy of the 24 "my instance" fallbacks | cosmetic, no behaviour change | 6 |
| **Total** | | **89** |

**Revised: 75–105 h, point estimate ~90 h.** The 58 host-chart sites are priced at **zero**
because they are correct as written. Excludes the provider itself, which is not this lane's
territory.

---

## 9. Everything in the brief that was wrong

| Claim | Reality |
|---|---|
| "consumed in 39 places and defined in none of them" (the ruling you corrected) | The "defined in none" half is right for the engine and now **proven**. **39 is not a figure I can reproduce**: `getActiveChart(` call sites are **27** in the engine and **84** repo-wide excluding `.ckpt`/`dist-v9`. Neither is 39. |
| "~211 direct `window.chart` references (52 chart.js, 159 modules)" | **199 raw AST nodes** = **45** in `chart.js` + **154** in modules — close in magnitude, so this one was nearly right. But the meaningful figure is **155 logical sites**; 39 lines are guard+use pairs. |
| Those references "bypass the seam entirely" and "are what make instance B deaf" | **The load-bearing error.** 33 raw nodes are already instance-preferring fallbacks behind `this.chart`, and 58 logical sites deliberately mean the host. 82 of 155 need no routing change; converting the host ones would break panel→host sharing. |
| `dist-v9/index.html:1837-1842` | Install is **1840-1843**; 1837 is the comment. |
| `MultichartGrid.jsx:7081-7087` | Body runs to **7091**; there is also an *uninstall* path at 7223/7226 you did not mention. |
| `chart.js:1570` registers "inside a branch" | True, but the branch opens at **1508**, not near 1570, and the handler *closures* are inside it too — panels do not merely miss the registration, the handler does not exist for them. |
| "`Chart.resize()` early-returns unless dimensions actually change" | Incomplete: **three** triggers — `sizeChanged \|\| dprChanged \|\| bufMismatch`. A same-size event can do work via `bufMismatch`. |
| "A codemod already exists and is file-agnostic — reuse it" | File-agnostic but **transformation-specific**: hardcodes `getElementById` and the class name `OrderManager`; its `window.chart` support is one raw-text tally. Not reusable for this rewrite; the `this`-binding method was reused and attributed. |
| E's controls: "make them go GREEN" | **They are already GREEN on the unmodified base with exit 0.** Pure model oracle, reads no product source. Cannot serve as the gate. Extended as instructed. |
| E's controls are at `083b87371` | Correct, but there is a **newer** `922b78365` adding the coordinate cell, and **neither is an ancestor of base `79625eac6`**. |
| `chart-embed.html:445-446` | Exact. |
| `vite.config.live.js:142-143`, ownership | Exact. Your ownership claim is right; I left both trees alone. |
| `_talariaInitializeChart` at `chart.js:42846` | Function region is right; the `window.chart` write is at **42870** and the idempotent read at **42847**. Worked around, not touched. |

---

## 10. Residuals and instrument limits

**Instrument limits**

1. **No browser.** The heavy-measurement lock is held elsewhere and a soak is running, so
   nothing here boots a chart, takes a heap snapshot, or runs a long harness. The
   behavioural cells are driven by facts extracted from the real `chart.js` by AST, and the
   mutant battery is the evidence that they depend on the shipped bytes. **A real
   two-instance browser reproduction of the 791×849 → 449×700 case is still owed** and is
   the one thing that would upgrade this from "mechanism pinned and gated" to "fix observed
   working".
2. The classifier's `guardedFallback` test is source-order based within one resolution
   expression. It would misread a fallback assembled across statements. I found no such
   case, but I did not prove their absence.
3. `acorn` is not a repo dependency, by design. The scripts need a scratch install and must
   be **copied next to `node_modules`** — Node resolves imports from the script's location,
   not cwd, so running them in place from `scripts/sr02/` fails. `_sr02_tools/` is scratch
   and deliberately not committed.

**Residuals**

4. **36 ambiguous sites need your decisions** before any further conversion. They are the
   remaining pricing risk; each is listed with file, line, class, method and enclosing
   expression in the classification JSON.
5. **The fix covers `resize` only.** The host also registers `focus`, `pageshow` and
   `visibilitychange` (`chart.js:1571-1573`) and panels still miss all three. Same defect
   shape, deliberately out of scope to keep this diff minimal. Not yet costed.
6. **`embed-bridge.js:866-882` is still the wrong shape** — its `ResizeObserver` redraws
   drawings without resizing. I did not touch it, since panels in iframes are
   `isPanel === false` and take the host path. In single-realm it becomes live and should
   probably call `ch.resize()`.
7. **A focus-aware provider is designed but not landed**, correctly — it belongs to
   whoever owns `talaria-design/`. It must survive the `MultichartGrid.jsx:7223/7226`
   uninstall path.
8. **`legacy-index.html` behaviour does change.** It is the only shell that constructs
   `isPanel === true` instances, so it is the only shipped-today consumer of the new code
   path, where it fixes the resize defect. It is in neither shipping shell's module set,
   but it is not nothing, and I did not test it.
9. `panel-managerv2.js` (45 text hits), `propfirm-tracker.js` (14, legacy-only) and
   `replay-news-panel.js` (2) are excluded: **no shipping shell loads them**. If anyone
   quotes a larger `window.chart` count, this is probably the difference.
10. Not touched, as instructed: `_multichartSamePairAsHost` bail-outs, `panel-cmd-bridge.js`,
    every iframe path, `_talariaInitializeChart`, `dist-v9/**`, `talaria-design/**`. No
    refactor body started.

---

## Reproduce

```
mkdir _sr02_tools && cd _sr02_tools
npm init -y && npm install acorn acorn-walk
cp ../scripts/sr02/*.mjs .
node run-all.mjs <repoRoot>          # 5 steps, all GREEN
node sr02-resize-harness.mjs base-chart.js   # GATE-01 RED on base, exit 1
SR02_MUTANT_STALE_CONTROL=1 node sr02-mutants.mjs <repoRoot>   # proves NOT_APPLIED fires
```

Evidence: `docs/plan3/evidence/A-SR02-FOCUS-ROUTING-20260731/`
