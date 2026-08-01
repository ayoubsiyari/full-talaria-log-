# A/SR-03 — input-routing conversion

**2026-07-31** · Manager A · branch `manager-a/focus-routing-20260731` · base `350707826`

Headline: **Policy 1 converted (11 of 14 briefed sites), Policy 2 implemented as explicit pointer-capture
ownership, Policy 4 honoured with two recorded traps plus a third I found, and Policy 5 REFUSED — it is not
implementable as briefed.** `order-manager.js` was not touched. Gate proven RED on base (11 cells), GREEN after
(17 cells). 13 mutants applied on disk to both mirrors, all killed by named behavioural cells; the negative
control did not apply.

> **Base note.** A concurrent commit `c181fb691` landed on this branch mid-packet. It is documentation only
> (`git diff --name-only 350707826 c181fb691` = two `.md` files); no engine source moved, so every line number
> and measurement below is still against the briefed base `350707826`.

---

## 1. Your premises, re-verified

You asked me to treat your numbers as claims. Most hold; four do not.

| # | premise | verdict |
| --- | --- | --- |
| 1 | `dist-v9/index.html:1842` and `chart-embed.html:446` install `getActiveChart` shims | **TRUE**, verbatim |
| 2 | `MultichartGrid.jsx:7084` installs a focus-aware provider, chains at `:7081`, restores at `:7223` | **TRUE**, all three lines exact |
| 3 | engine has already partially adopted it — "7 in chart.js, 34 in modules" | **half right.** chart.js = **7** ✓. modules = **32**, not 34 |
| 4 | `window.mainChart` appears 11 times in chart.js + modules | **WRONG: 10** (1 + 9). 11 only if you also count `settings-panel.js`, which is not a module; 12 with the favourites harness blob |
| 5 | control: `window.chart` appears 40 times in chart.js | **TRUE — exactly 40**, on `grep -c` line semantics |
| 6 | eight of the 14 Policy 1 sites use the `window.chart \|\| window.mainChart` chain | **TRUE — exactly 8** |
| 7 | `panelManager` never assigned: "0 assignments, 88 references, control `.drawingManager =` returns 6" | **direction right, numbers wrong.** 0 assignments in engine JS ✓; references = **99**, not 88; control = **23**, not 6 |
| 8 | `indicator-ui.js:3100` reads `window.chart.panelManager` **UNGUARDED** | **WRONG.** It is guarded: `... && window.chart && window.chart.panelManager` |

Your counting method is `grep -c`, i.e. **matching lines, not occurrences** — that is why premise 5 is exact
(40 lines / 52 occurrences) and why premise 3's chart.js figure is exact. I used line semantics throughout so
the numbers are comparable.

Two further corrections worth having:

- **The ruling doc is against a different base.** It says `79625eac6`; the census JSON was written at
  `e1504033c`, which changed `chart.js` by 45 lines. `chart.js` is byte-identical between `e1504033c` and the
  briefed base, so the census line numbers are valid — but the header is misleading.
- **The `|| window.mainChart` chain is provably dead.** Repo-wide there is exactly **one** write to
  `window.mainChart`: `chart.js:42914`, on the line after `window.chart = chartInstance` and to the *same
  object*. The chain could never have named a different chart. That is what makes the Director's "collapse it"
  ruling free of behavioural risk, and I cite it in the code comment.

---

## 2. What I converted

### Policy 1 — host chrome resolves through the focus provider (11 of 14)

A single idempotent resolver, `window.__talariaActiveChartV1()`, installed in each participating file:

```js
if (window.__TALARIA_DISABLE_FOCUS_ROUTING_V1) return window.chart || window.mainChart || null; // OFF: base
if (typeof window.getActiveChart === 'function') { const a = window.getActiveChart(); if (a) return a; }
return window.chart || null;                                                                     // collapsed
```

It is installed **per file, idempotently**, rather than once in `chart.js`, because the load order forbids a
single definition: `favorites-manager.js` runs at script index 32 and `chart.js` at 39 in
`dist-v9/index.html`, and `multichart-prod/chart-embed.html` **never loads `chart.js` at all**. This mirrors
the in-tree precedent — the `getActiveChart` shim is already duplicated verbatim across the two shells.

| site | done |
| --- | --- |
| `economic-news-sidebar.js` 261, 1365, 1577, 1587 | converted (4) |
| `favorites-manager.js` 628 | converted (1) |
| `indicator-ui.js` 4010, 4964, 6247 | converted (3) |
| `screenshot-manager.js` 1706, 1707 | converted (2 sites → 1 resolver call) |
| `chart.js` 17215 | converted (1) |
| `compare-overlay.js` 285, 323 | **already compliant — no edit** |
| `chart.js` 18419 | **refused — trap, see §3** |

Measured: 11 briefed sites converted, 10 resolver call sites (`site-accounting.txt`).

`chart.js:17215` was a real leak, not a cosmetic conversion. `showSettingsMenu` stamps `_settingsSourceChart`
on **`this`** when the chart is not a panel (line 17206), but `hideSettingsMenu` cleared it on **`window.chart`**.
With two non-panel instances, opening and closing settings on B left `B._settingsSourceChart === B` forever.
Cell `SR03-C05` drives the real `showSettingsMenu`/`hideSettingsMenu` pair and was RED on base for exactly this.

### Policy 2 — the gesture belongs to whoever received `pointerdown` (1 of 3)

Implemented as **explicit ownership at the pointer-capture boundary**, which is what "make ownership explicit
rather than inferred" asks for. Pointer capture already existed in the pan path, so this is three small edits
on the existing seam, not a new mechanism:

- `_tryCaptureDragPointer` records `window.__talariaGestureOwnerV1 = this` **inside the `try`, after
  `setPointerCapture` succeeds**, so ownership tracks actual capture.
- `_releaseDragPointerCapture` clears it when the owner is `this`.
- `_findActivePanChart` consults the recorded owner **before** the inferred scan.

The `window.chart` read at 19329 is not deleted: it is **demoted** below explicit ownership and remains the
fallback for when no gesture is in flight, which is correct — with no capture there is nothing to own.

### Policy 4 — comments recorded, no code change

Comments added at `chart.js:17248` and `chart.js:42890` recording what each is, as instructed. All nine sites
verified unchanged (`site-accounting.txt`).

---

## 3. What I refused, and why

### Policy 5 — REFUSED, all five. The premise is false.

**"These are per-instance and become `this`" cannot be done: none of the five sites has an instance.** All
five are plain function declarations inside module IIFE scope. The census you sent me records this itself:

```
chart-indicators-full.js:2206  binding=INNER_FUNCTION  class=null  method=null
chart-indicators-full.js:2305  binding=INNER_FUNCTION  class=null  method=null
chart-indicators-full.js:3144  binding=INNER_FUNCTION  class=null  method=null
chart-indicators-full.js:4963  binding=INNER_FUNCTION  class=null  method=null
indicator-ui.js:3100           binding=INNER_FUNCTION  class=null  method=null
```

`vwapCurrentAssetClass()`, `vwapCorporateEventTimestamps()`, `killzonesBarWallClock()` and
`talariaChartForOhlcPanel()` are free functions. `this` there is `undefined` or the global object, never a
Chart. Writing `this.currentSymbol` would silently read nothing.

The Director's reasoning ("reaching through `window.chart` was only ever shorthand for `this`") is sound for
*methods* of the indicator classes, but these five are not methods. Making them per-instance requires
**threading the chart through as a parameter from every caller** — a refactor of the indicator call graph, with
its own gate. That is a different packet and I did not start it. I also did not substitute the focus provider,
because Policy 5 explicitly rules "no focus provider involved" and I am not entitled to overturn that.

Related: `indicator-ui.js:3100` is **already guarded**, so there was no unguarded read to avoid introducing.

### `chart.js:18419` — a third trap the ruling did not catch

Policy 1 lists it for conversion. It must not be converted, for exactly the reason 17248 must not be:

```js
const activeChart = (typeof window.getActiveChart === 'function') ? window.getActiveChart() : this;  // 18407
const targetChart = activeChart || this;                                                             // 18408
...
const loadPromise = (targetChart.isPanel && targetChart !== window.chart && ...)                     // 18419
```

`targetChart` is **already resolved through the focus provider**, eleven lines above. The Policy 1 conversion
at this site is therefore already done, and the `window.chart` at 18419 is a *host-identity discriminator*
meaning "the target is a secondary panel, not the host". Routing it too reduces the test to `x !== x`, which is
permanently false, and `loadPanelFileData` would never run again — a silent, total inversion.

I did not just assert this. Mutant **M12** applies that exact conversion on disk, and cell `SR03-C17` — which
drives the real `setupSymbolSearchSwitcher` click handler — kills it. The refusal is demonstrated, not argued.

### Policy 2 sites 5352 and 25755 — refused, they are not gesture-target reads

Both were briefed on the concern that "ownership moving mid-gesture would load history against the wrong
viewport". That concern does not apply to either read, because neither selects a viewport:

- **`chart.js:5352`** uses `window.chart` for one thing only: `mainChart.replaySystem.isPlaying`. It is the
  third of three replay-state guards (`this.replaySystem`, `host.replaySystem`, then the host singleton), and
  the comment above it names the regression it prevents ("refetch over / break on play"). Re-pointing it at
  the gesture owner makes it either a duplicate of the `this` check on line 5348 or drops the host guard.
- **`chart.js:25755`** uses it for `this !== mainChart` (host identity) and `mainRs.isActive` (host replay
  state). The viewport `checkViewportLoadMore` acts on is always `this`, never this read. Routing it turns
  `this !== mainChart` into `this !== this` and disables the follower-tile guard — the same inversion as 18419.

Both stay host. If the Director wants them revisited, the question to rule is "should follower tiles consult
host replay state at all", which is a replay-ownership question, not an input-routing one.

### Assessed and deliberately not collapsed

- **`drawing-tools-manager.js:845` (`add(window.mainChart)`)** — textually the same idiom, semantically the
  opposite. 844/845 build a **union** of every chart for cross-panel deselect, not a fallback chain.
  Collapsing it would shrink the set and break the deselect that Policy 4 protects at 844.
- **`settings-panel.js:7`** (`function ch(){ return window.chart || window.mainChart || null; }`) — a genuine
  Policy 1 idiom that the census never saw, because the census only scans `chart.js` plus `modules/*.js`
  reachable from the two shells. I checked whether it is live: **neither shipping shell references
  `settings-panel.js`**. It is not on the booted path, so I left it. Worth noting as a census scope gap rather
  than a routing decision.

---

## 4. Evidence

### GATE-01 — RED before, GREEN after

The gate was written and proven RED **before** the fix existed, and re-proven RED on base after the two cells
I strengthened (`scripts/sr03/red-on-base.mjs` swaps the five product files back to `350707826`, runs the
final gate, restores and hash-verifies).

| | on base `350707826` | after the conversion |
| --- | --- | --- |
| pass | 6 | **17** |
| fail | **11** | 0 |

RED on base (11): C01 econ sidebar resolution · C02 marker redraw · C03 favourites tool · C04 indicator UI
bind · C05 settings-source clear · C06 chain vs provider · C07 pointerdown owner · C08 ownership survives
focus change · C11 falsy keeps fix · C12 mid-run flip · C14 FLAG-03 pan.

Green on base by design (6): C09 (release, regression guard), C10 (truthy disables — base *is* the disabled
behaviour), C13 (OFF-arm product), C15/C16 (source pins), C17 (18419 non-inversion guard).

Every RED was an `ERR_ASSERTION`, not a harness crash — I fixed three harness gaps precisely so the RED would
mean something.

### Cells drive production, not restatements

Every behavioural cell extracts real source from the shipping files and runs it in a `vm` sandbox: the real
`mainChart()`, `requestChartMarkerRedraw()`, `activateTool()`, `_tryInitIndicatorUI()`, `showSettingsMenu`/
`hideSettingsMenu`, `_findActivePanChart`, `_tryCaptureDragPointer`, `_releaseDragPointerCapture`, `panBy`
and `setupSymbolSearchSwitcher`. What varies between arms is what production varies: which chart the provider
names, whether a pointer was captured, and the kill-switch value.

**Two cells assert on source text and are labelled `[SOURCE-PIN]` in their names** — C15 (the 17248 / 42890
identity and boot guards) and C16 (order-manager untouched). They pin design choices; they do not verify
behaviour, and the mutant runner explicitly refuses to count them as kills.

### FLAG-01/02 — one switch, read per call

`window.__TALARIA_DISABLE_FOCUS_ROUTING_V1`. Truthy disables, falsy keeps the fix, written as a plain
truthiness test — **not** `=== true`.

- C10 drives the disable side with `[true, 1, 'yes', 'true', {}, [], '0']`.
- C11 drives the keep side with `[undefined, null, false, 0, '', NaN]`.
- C12 flips the switch **mid-run on one live resolver instance** through
  `absent → true → false → 'yes' → undefined`, proving the value is re-read on every call and never captured
  at registration.

Mutant M01 introduces the exact `=== true` defect you warned about and is killed by C10 and C12.

### FLAG-03 — the OFF arm is a working product

C13 asserts that with the switch disabled, chrome still resolves to a **usable** chart (non-null, with a live
`scheduleRender`) for all seven truthy values, and that favourites still actually applies a tool. C14 asserts
that **a pan still moves a viewport in both arms**: it resolves the pan target, calls the real `panBy(40, 0)`,
and checks `offsetX` moved 0 → 40 and that a repaint was issued — with the fix off (owner = host) and on
(owner = the capturing instance).

### Mutants — designed, applied on disk to both mirrors, and run

14 designed, 13 applied, **13 died**, 1 negative control correctly not applied, 0 unsatisfactory. Full log in
`mutants-on-disk.txt`; machine-readable in `mutants.json`.

| id | file | mutation | outcome | killed by |
| --- | --- | --- | --- | --- |
| M01 | econ | kill-switch compared with `=== true` | DIED | C10, C12 |
| M02 | econ | switch captured at registration, not per call | DIED | C12 |
| M03 | econ | provider result discarded (fix inert) | DIED | C01, C02, C06, C11, C12 |
| M04 | econ | `mainChart()` reverts to the chain | DIED | C01, C06, C11, C12 |
| M05 | econ | chain survives *beside* the provider | DIED | C06 |
| M06 | favorites | `activateTool()` reverts to the chain | DIED | C03 |
| M07 | indicator-ui | init reverts to the chain | DIED | C04 |
| M08 | chart.js | settings stamp cleared on host again | DIED | C05 |
| M09 | chart.js | `_findActivePanChart` ignores explicit owner | DIED | C07, C08, C14 |
| M10 | chart.js | ownership never released | DIED | C09 |
| M11 | chart.js | ownership never recorded at capture | DIED | C07, C08, C14 |
| M12 | chart.js | **route 18419 through the provider (the trap)** | DIED | C17 |
| M13 | chart.js | owner read ignores the kill-switch | DIED | C14 |
| NEG | chart.js | needle that must not exist | **NOT_APPLIED (expected)** | — |

The runner reports `NOT_APPLIED` loudly and fails the packet whenever a needle matches zero or more than one
site, refuses to accept a kill by C15/C16, and restores every file to its baseline SHA-256 afterwards
(verified: all four files `MATCH`).

M10 initially **survived** and I fixed the gate rather than the report: my owner check is `isPan`-guarded, so a
stale never-released owner was invisible. C09 now drives the realistic sequence — release runs before the drag
flags reset — and asserts both that a released instance cannot win on a stale flag and that the ownership
handle is dropped, so a finished chart is not retained.

### Mirrors

All 70 mirrored product `.js` pairs were **byte-identical at base** — no pre-existing divergence, so a straight
copy was safe and no diff transplant was needed. After the conversion, all 70 pairs are byte-identical again.

```
chart.js                          1c995dc28d9bcac4
modules/economic-news-sidebar.js  31a20659815a9131
modules/favorites-manager.js      c5781419c23f4ffb
modules/indicator-ui.js           4b153349fee34f36
modules/screenshot-manager.js     a00e45d3b2d1f740
```

`.mjs` harnesses are **not** mirrored in this repo (171 canonical vs 116 homepage), so the gate and mutant
runner live only in the canonical tree, matching house convention.

### order-manager.js was not touched

```
$ git diff --name-only 350707826 -- "chart v 1.4/chart" "homepage/public/chart"
chart v 1.4/chart/chart.js
chart v 1.4/chart/modules/economic-news-sidebar.js
chart v 1.4/chart/modules/favorites-manager.js
chart v 1.4/chart/modules/indicator-ui.js
chart v 1.4/chart/modules/screenshot-manager.js
homepage/public/chart/chart.js
homepage/public/chart/modules/economic-news-sidebar.js
homepage/public/chart/modules/favorites-manager.js
homepage/public/chart/modules/indicator-ui.js
homepage/public/chart/modules/screenshot-manager.js
```

Ten files, five pairs, no `order-manager.js` in either mirror. Cell C16 additionally asserts on every run that
neither copy contains the resolver or the kill-switch. Nothing in this packet came close to needing it.

---

## 5. Counts per policy

| policy | briefed | converted | already compliant | refused |
| --- | --- | --- | --- | --- |
| 1 — chrome follows focus | 14 | **11** | 2 (`compare-overlay` 285, 323) | 1 (`chart.js:18419`, trap) |
| 2 — gesture ownership | 3 | **1** (+ 2 supporting edits at the capture/release seam) | 0 | 2 (5352, 25755 — not gesture reads) |
| 4 — stay host | 9 | **0** (correct) | 9 | — |
| 5 — become `this` | 5 | **0** | 0 | **5 — premise false** |

---

## 6. Residual I could not close

1. **Policy 5 is entirely open.** Needs a parameter-threading packet through the indicator call graph. Five
   sites, plus whatever their callers require.
2. **Screenshots do not follow focus yet.** I routed `initScreenshotManager` (1706/1707), but
   `ScreenshotManager` caches the chart as `this.chart` in its constructor, so this only changes which chart
   it is *built* against at boot — when the provider still returns the host anyway. **This conversion is
   effectively inert.** Making capture follow focus means resolving at capture time inside the manager, which
   is a behaviour change to the capture path and needs its own gate. I left a comment at the site saying so.
3. **`chart.js:17248` is protected only by a source pin.** `_applyChartSettingsImmediate` is 314 lines and too
   entangled to drive end-to-end in this harness, so unlike 18419 I could not build a behavioural cell or an
   honest mutant for it. It is guarded by C15 and a comment. A behavioural cell there wants a real DOM harness.
4. **`compare-overlay.js` 285/323 do not honour the kill-switch.** They were already focus-routed before this
   packet, so leaving them preserves base behaviour in both arms — but it means the ablation does not cover
   that surface. Deliberate: converting them would have been a behaviour change dressed as a no-op.
5. **`settings-panel.js:7`** carries the chain and is not on the booted path. Either delete the file or bring
   it into the census scope; right now it is neither live nor tracked.
6. **`panelManager` is dead and I left it dead**, as instructed — 0 assignments to the instance property, 99
   dependent reference lines. Note this makes the panel-scan branch of `_findActivePanChart` (19330-19335)
   unreachable today; the explicit-ownership path I added does not depend on it.

---

## 7. Corrections against the brief, in one place

1. **Policy 5 cannot be implemented as ruled** — all five sites are free functions with no `this`. Refused.
2. **`indicator-ui.js:3100` is guarded**, not unguarded.
3. **`chart.js:18419` is a third trap**, not a Policy 1 site — demonstrated by mutant M12 and cell C17.
4. **Policy 2 has one real site, not three** — 5352 and 25755 are host replay-state and host-identity reads.
5. **`window.mainChart` is 10, not 11**; **`getActiveChart` in modules is 32, not 34**; **panelManager
   references are 99, not 88, control 23, not 6.** `window.chart` at 40 and the 8-of-14 chain count are exact.
6. **`compare-overlay.js` 285/323 were already converted** before this packet — 2 of your 14 were already done.
