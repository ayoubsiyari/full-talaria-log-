# M27 — Retainer path for destroyed `M20Q6ReplaySystem`

- **Manager:** A
- **Row:** orphan-leak-unbounded
- **Packet:** m27-retainer-path
- **Tier:** opus-5
- **Date:** 2026-07-28

**Pin (TREE-01).** Every `file:line` in this document is pinned to commit **`cb676b59e`** on branch
**`manager-a/critical-path`**, read in the worktree `C:\Users\user\Desktop\talaria1\manager-a-critical-path`.
Every claim in this document concerns **`manager-a/critical-path` @ `cb676b59e`** and no other branch.
The main checkout (`manager-c/verification-infra`) was never checked out, stashed, or written to.

Line numbers were located **by content**, not by the offsets in the originating finding. Governing docs
were read via `git show` only (`docs/` is gitignored, so ripgrep skips it silently).

---

## 0. Answer in one paragraph

The strong reference path is:

```
detached panel realm global object  (Window of the removed <iframe class="multichart-embed">)
  → window.chart            [chart.js:41936-41937]   (also window.mainChart, chart.js:41938)
  → Chart.orderManager      [chart.js:13311]
  → OrderManager.replaySystem [order-manager.js:452]  ← STRONG, never nulled
  → M20Q6ReplaySystem  { _m20Q6LifecycleState: "destroyed" }
```

with a second, parallel strong hop through the same `OrderManager`:

```
  → Chart.orderManager      [chart.js:13311]
  → OrderManager.orderService [order-manager.js:465-470]
  → OrderService.replaySystem [order-service.js:8]     ← STRONG, never nulled
  → the same M20Q6ReplaySystem
```

**This is the defect.** The M20-Q6 drain nulls exactly one of the three strong references to the engine —
`chart.replaySystem` at `replay-system.js:9820-9822` — and leaves `chart.orderManager.replaySystem`
(`order-manager.js:452`) and `chart.orderManager.orderService.replaySystem` (`order-service.js:8`)
pointing at the destroyed engine. Both are set from the engine at construction time
(`chart.js:13235` → `13240` → `13311` → `order-manager.js:452` → `465-470` → `order-service.js:8`)
and **neither is ever assigned `null` anywhere in product code** (§3, exhaustive search given).
Consequently *any* retainer of the panel `Chart` is automatically a retainer of the destroyed engine,
and `destroy()` returning a clean `state: 'destroyed'` report is fully compatible with 0 bytes freed.
That is precisely why M26 (`a9c7e34c9`) was accepted as "code-correct, effect not demonstrated"
(`cb676b59e` commit subject): M26 calls `destroy()` correctly, and `destroy()` does not release the engine.

**What I cannot name from source, and say so plainly:** the *root above the panel realm global* — i.e. what
keeps each removed iframe's `Window`/`Document` alive across cycles. §6 enumerates every candidate that
exists in source and shows that none of them is unbounded-by-construction, so the unbounded root is not
nameable from source alone. §7 states the exact single reading of the PO's **existing** snapshot that names it.

**Both of your eliminations are correct, but one is incomplete in a way that matters** — see §5.

**Three false premises in the inherited evidence are reported in §1, §2 and §8 (BRIEF-02).**

---

## 1. FALSE PREMISE (BRIEF-02): the PO's "named retaining edge" is not a retaining edge

The PO's edge is:

```
1 / part of key {M20Q6ReplaySystem @14714091} -> value (Object @22396091) pair in Map
```

I did not reason about this from memory. I measured it, because the standard of proof on this row is higher
than recollection. Node 24 (`v24.15.0`) embeds V8 and uses the same `heap-snapshot-generator` code paths as
Chrome DevTools. I built a probe holding **both** a `WeakMap` and a strong `Map` keyed by an object whose
constructor is named `M20Q6ReplaySystemProbe`, wrote a real `.heapsnapshot` to `%TEMP%` (outside the repo;
deleted afterwards — nothing was written into any git tree except the file named in the writable set),
and walked the `nodes`/`edges` arrays to recover the edge name *together with its from-node and to-node*.

Result:

| measured property | value |
|---|---|
| edge name emitted | `3 / part of key (M20Q6ReplaySystemProbe @103859) -> value (Object @103861) pair in WeakMap (table @106193)` |
| edge type | `internal` |
| **from-node** | `object M20Q6ReplaySystemProbe`  ← the **key** |
| **to-node** | `object Object`  ← the **value** |
| emitted for the strong `Map` with an object key? | **No. Zero `part of key` edges.** |

Three consequences, each load-bearing:

1. **The wording is `WeakMap`, not `Map`.** V8 emits this format string *only* for ephemeron tables
   (`WeakMap`/`WeakSet`). A strong `Map` produces no `part of key` edge at all; its entries appear as plain
   indexed element edges of the backing `OrderedHashMap`. The PO's transcription dropped the word `Weak`
   and the trailing `(table @…)`, and substituted `{…}` for V8's `(…)`. The `1 /` prefix is V8's
   auto-index prefix and matches exactly.
2. **The edge runs *from* the key *to* the value.** It is an **outgoing** edge of the `M20Q6ReplaySystem`.
   It retains the `Object` — it does not retain the engine. This is exactly the failure mode you flagged in
   task item 3: a reference *from* the instance retains nothing.
3. **An ephemeron edge cannot retain its own key**, by definition of `WeakMap`. So this edge could never
   have been the retainer regardless of direction.

**Therefore the PO's snapshot does not name the retainer.** It names the engine's own per-instance side
table. This is, I believe, the reason a source-plausible mechanism was merged and then refuted on this row:
the investigation has been chasing an edge that points the wrong way.

**Corollary that is still useful.** Because heap snapshots are taken after a full GC and V8 only keeps
ephemeron entries whose key survived, the presence of this edge is positive proof that the engine
**is** strongly reachable from a real root — it just says nothing about which. It also identifies the value
`Object @22396091` precisely: see §2.

---

## 2. FALSE PREMISE (BRIEF-02): "the heap says *Map*, so check the two strong `Set`s"

Your instruction was to confirm whether either strong `Set` (`replay-system.js:9209`, `:9528`) or a WeakMap
ephemeron could render in that form before discarding them on wording alone. Answer: **a WeakMap ephemeron
renders in exactly that form; a strong `Set` cannot.** A strong `Set` has no key/value pair at all — V8
represents it as an `OrderedHashSet` with indexed element edges, so it can never produce
`part of key … -> value …`. Both `Set`s are therefore eliminated *by the heap wording itself*, and
independently by source (§4, rows S1/S2).

The ephemeron is uniquely identified. Searching for every container in the four trees whose **key** is a
replay-system instance and whose **value** is a plain object gives exactly one hit:

```
replay-system.js:9089   const m20Q6States = new WeakMap();
replay-system.js:9627   m20Q6States.set(instance, state);
```

and `state` is the object literal at `replay-system.js:9613-9626`, whose fields include
`instance` (`:9614`) and `chart: instance.chart` (`:9615`). A plain object literal is named `Object` by V8.
Key `M20Q6ReplaySystem` (class declared at `replay-system.js:9856`), value `Object` — an exact shape
match on both node names.

So `Object @22396091` is the M20-Q6 `state` record, and `@14714091` is its engine. Note the direction this
implies: `state.instance` at `:9614` means **`state` → engine is strong**. The `state` record is therefore a
*retainer candidate in its own right*, and it is eliminated in §4 row W1, not by wording.

---

## 3. The named path, hop by hop, with the direction that matters

Task item 3: only an edge from a longer-lived root *to* the instance counts. Each hop below is an
incoming edge of the next object, verified in source.

| # | Edge | Site @ `cb676b59e` | Strength | Nulled on teardown? |
|---|---|---|---|---|
| H0 | panel realm global → `window.chart` | `chart.js:41936-41937` | strong | no |
| H0' | panel realm global → `window.mainChart` | `chart.js:41938` | strong | no |
| H1 | `Chart` → `.orderManager` | `chart.js:13311` (`initOrderManager`, `13308-13312`) | strong | **no** |
| H2 | `OrderManager` → `.replaySystem` | `order-manager.js:450-452` | strong | **no** |
| H2' | `OrderManager` → `.orderService` → `.replaySystem` | `order-manager.js:465-470`, `order-service.js:6-8` | strong | **no** |
| — | `Chart` → `.replaySystem` | `chart.js:13235` | strong | **yes**, `replay-system.js:9820-9822` |

Construction order that wires H1/H2, all inside `initReplaySystem`:

```
chart.js:13235   this.replaySystem = new replaySystemCtor(this);
chart.js:13240   this.initOrderManager();
chart.js:13311       this.orderManager = new OrderManager(this, this.replaySystem);
order-manager.js:451     this.chart = chart;
order-manager.js:452     this.replaySystem = replaySystem;      // ← second strong ref
order-manager.js:465-470 this.orderService = new OrderService({ chart, replaySystem, eventBus });
order-service.js:7           this.chart = chart;
order-service.js:8           this.replaySystem = replaySystem;  // ← third strong ref
```

`initOrderManager` is gated only on `typeof OrderManager !== 'undefined' && this.replaySystem`
(`chart.js:13310`) — there is no panel/host branch, so every panel engine gets H2 and H2'.

### Exhaustive search behind the negative claims in this table

No negative claim without a stated exhaustive search. All commands run from the worktree root.

Every assignment of `null`/`undefined` to any `.replaySystem`, whole repo:

```
git grep -n -E "replaySystem\s*=\s*(null|undefined)|delete\s+[a-zA-Z_$.]*\.replaySystem" cb676b59e \
  -- "chart v 1.4/chart" "chart v 1.4/talaria-design/src"
```

Four hits. Three are tests (`m19-i-f-frame-coherence.test.mjs:254`, `m19-i-indicator-tail.test.mjs:182`,
`m25-render-pending-accessor.test.mjs:382`). **The only product hit is `replay-system.js:9821`,
`state.chart.replaySystem = null`.** Nothing nulls the OrderManager's or OrderService's copy.

Every assignment of `null`/`undefined` to `.orderManager` / `.orderService`:

```
git grep -n -E "orderManager\s*=\s*(null|undefined)|orderService\s*=\s*(null|undefined)" cb676b59e \
  -- "chart v 1.4/chart" "chart v 1.4/talaria-design/src"
```

18 hits, **all** in `m19-persist-trim-contract.test.mjs` and `harness/scenarios.mjs`. **Zero in product
code.** `chart.orderManager` is never released.

Every mention of `orderManager`/`orderService` inside `replay-system.js`, to prove the drain never
touches them:

```
git show cb676b59e:"chart v 1.4/chart/modules/replay-system.js" | Select-String -Pattern "orderManager|orderService"
```

34 hits, highest at `:8971`. The drain body `m20Q6DrainState` spans `:9667-9854`. **No hit falls inside the
drain.** The drain's only ownership releases are `m20Q6ChartOwners.delete` (`:9817-9819`) and
`state.chart.replaySystem = null` (`:9820-9822`).

Every construction site of the two holders:

```
git grep -n -E "new OrderManager|new OrderService" cb676b59e -- "chart v 1.4/chart" ":!*test*"
```

Two hits: `chart.js:13311`, `order-manager.js:466`. No other holder is constructed anywhere.

---

## 4. Elimination table — every strong `Map`/`Set` that could hold an engine, chart, panel window or panel document

Scope searched: `chart v 1.4/chart/chart.js`, `chart v 1.4/chart/modules/**`,
`chart v 1.4/chart/multichart-prod/**`, `chart v 1.4/talaria-design/src/**`.

### Reproducible enumeration commands

**(E1) Every container constructor in the four trees.**

```
git grep -n -E "new Map\(|new Set\(|new WeakMap\(|new WeakSet\(" cb676b59e \
  -- "chart v 1.4/chart/chart.js" "chart v 1.4/chart/modules" \
     "chart v 1.4/chart/multichart-prod" "chart v 1.4/talaria-design/src"
```

**(E2) Module-level (closure-scope) container declarations — these outlive panels, so they matter most.**

```
git grep -n -E "^\s{0,4}(const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*new (Map|Set)\(" cb676b59e \
  -- "chart v 1.4/chart/chart.js" "chart v 1.4/chart/modules" \
     "chart v 1.4/chart/multichart-prod" "chart v 1.4/talaria-design/src"
```

**(E3) The signature you asked for in task item 4 — object-keyed `.set()`.** Every `.set()` whose first
argument is an identifier or member expression rather than a string/number literal:

```
git grep -n -E "\.set\(\s*[A-Za-z_$][A-Za-z0-9_$.]*\s*[,)]" cb676b59e \
  -- "chart v 1.4/chart/chart.js" "chart v 1.4/chart/modules" \
     "chart v 1.4/chart/multichart-prod" "chart v 1.4/talaria-design/src" ":!*test*" ":!*harness*" \
  | Select-String -NotMatch -Pattern "setProperty|setAttribute|setItem|setTime|setHours|setDate|setMonth|setFullYear|setMinutes|setSeconds|setMilliseconds|setUTC"
```

> **Method note / trap for the next reader.** My first run of E3 used the character class
> `[A-Za-z0-9_$.\[\]]`. In POSIX ERE the bracket expression terminates at the first unescaped `]`, so that
> pattern silently compiled to something else and returned 4 hits instead of ~150 — it dropped
> `_b70Stage5Hosts.set(chart, …)` and `registry.set(target, …)`, the two hits most likely to be the answer.
> Any re-run must use the class above, with no `\[\]` inside it. The 4-hit result is a false negative.

**(E4) The `Set` analogue — object-valued `.add()`.**

```
git grep -n -E "\.add\(\s*(chart|ch|instance|replaySystem|replay|engine|win|window|doc|document|panel|frame|iframe|target|node|el|element|entry|state|self|this)\s*\)" cb676b59e \
  -- "chart v 1.4/chart/chart.js" "chart v 1.4/chart/modules" \
     "chart v 1.4/chart/multichart-prod" "chart v 1.4/talaria-design/src" ":!*test*" ":!*harness*" ":!*.bak"
```

**(E5) Cross-realm writes from panel code to the host realm.**

```
git grep -n -E "(window\.top|window\.parent|\btop|\bparent)\.(addEventListener|__[A-Za-z0-9_$]+\s*=)" cb676b59e \
  -- "chart v 1.4/chart/chart.js" "chart v 1.4/chart/modules" "chart v 1.4/chart/multichart-prod" ":!*test*" ":!*harness*"
```

**(E6) Host-realm references to panel realms, and host storage of them.**

```
git grep -n -E "contentWindow|contentDocument" cb676b59e -- "chart v 1.4/talaria-design/src" ":!*test*"
git grep -n -E "(current\s*=\s*(cw|ch|ifr|frame|iw|w|el)\b|\.push\(\s*(cw|ch|ifr|frame|iw|entry)\s*\)|(window|globalThis)\.__[A-Za-z0-9_$]+\s*=\s*(cw|ch|ifr|frame|iw)\b)" cb676b59e \
  -- "chart v 1.4/talaria-design/src" "chart v 1.4/chart/multichart-prod" ":!*test*" ":!*harness*"
```

### Result of E3/E4: there is no strong container keyed by a chart or an engine anywhere

E3 returns ~150 hits. **Every hit with an object key resolves to a `WeakMap`.** The complete list of
object-keyed containers in the four trees, with the declaration that proves weakness:

| Container | `.set()` site | Declaration | Weak? |
|---|---|---|---|
| `_b70Stage4PrivateBuilds` | `chart-indicators-full.js:9079` | `chart-indicators-full.js:8561` | **WeakMap** |
| `_b70Stage5Hosts` | `chart-indicators-full.js:8594` | `chart-indicators-full.js:8562` | **WeakMap** |
| `_b70Stage5Panels` | `chart-indicators-full.js:8614` | `chart-indicators-full.js:8563` | **WeakMap** |
| favorites lease `registry` | `favorites-manager.js:801` | `favorites-manager.js:777-780`, WeakMap at `:778` | **WeakMap** |
| `byMaster` | `replay-system.js:3859` | `replay-system.js:3844` | **WeakMap** |
| `m20Q6TargetBridges` | `replay-system.js:9241` | `replay-system.js:9092` | **WeakMap** |
| `m20Q6PageStates` | `replay-system.js:9535` | `replay-system.js:9091` | **WeakMap** |
| `m20Q6States` | `replay-system.js:9627` | `replay-system.js:9089` | **WeakMap** |
| `m20Q6ChartOwners` | `replay-system.js:9633` | `replay-system.js:9090` | **WeakMap** |
| `indicatorMapsByChartRef` (`wm`) | `TalariaV8bLive.jsx:16073` | `TalariaV8bLive.jsx:16065-16067` | **WeakMap** |

**Negative claim, with the search stated: no strong `Map` or `Set` in `chart.js`,
`chart v 1.4/chart/modules/**`, `chart v 1.4/chart/multichart-prod/**` or
`chart v 1.4/talaria-design/src/**` is keyed on, or contains, a `Chart` or a replay-system instance.**
Basis: E1+E2+E3+E4 as above; every object-keyed hit is in the table and every one is weak; every E4 hit is
either a per-call local dedupe `Set` or covered in the rows below.

### Row-by-row

| ID | Container | Site | Verdict | Reason |
|---|---|---|---|---|
| W1 | `m20Q6States` (WeakMap) | decl `replay-system.js:9089`, set `:9627` | **Eliminated as retainer; identified as the PO's edge** | Ephemeron: cannot retain its key. `state.instance` (`:9614`) is strong *outward*, so `state` retains the engine — but `state` itself has no strong holder after a clean drain (rows S2, A1, W2). This is the edge the PO named (§1, §2). |
| W2 | `m20Q6ChartOwners` (WeakMap) | decl `:9090`, set `:9633` | Eliminated | Ephemeron keyed by `chart`; would retain `state` → engine *if the chart lived*, but the clean path deletes the entry at `:9817-9819`. Note this deletion is now redundant: H1/H2 (§3) retain the engine via the chart anyway. |
| W3 | `m20Q6PageStates` (WeakMap) | decl `:9091`, set `:9535` | Eliminated | Ephemeron keyed by `scope` (the realm's `window`). Value `page` (`:9526-9532`) holds `states: new Set()` — see S2. |
| W4 | `m20Q6TargetBridges` (WeakMap) | decl `:9092`, set `:9241` | Eliminated | Ephemeron keyed by listener `target`. Value `meta` holds `entries: new Set()` — see S1. |
| W5 | `byMaster` (WeakMap) | `replay-system.js:3844`, `:3859` | Eliminated | Ephemeron keyed by `master` data array; value is a buffer, holds no engine. |
| S1 | `meta.entries` — **strong `Set`** | decl `replay-system.js:9209`, add `:9283` | **Eliminated, with the reason stated** | Real strong path exists: `target` → own `removeEventListener` installed at `:9232-9236` → `meta.bridge` closure (`:9212-9230`) → `meta` → `entries` → `entry` → `entry.wrapped` (`:9279-9281`) → captured `state` → `state.instance` → engine. It is closed on the clean path: the drain removes every event entry at `:9738-9740` via `m20Q6RemoveEventEntry`, which deletes from `meta.entries` at `:9190` and restores the target's own `removeEventListener` at `:9164-9174` once the set empties. `pending === 0` at `:9814` cannot hold unless all of `state.events` settled. Also eliminated by heap wording (§2): a `Set` cannot render as `part of key → value`. |
| S2 | `page.states` — **strong `Set`** | decl `replay-system.js:9528`, add `:9606`, `:9644` | **Eliminated, with the reason stated** | Would retain `state` → engine. But `m20Q6ReleasePageState` (`:9584-9608`) deletes the state at `:9587` and the clean-path guard at `:9814` requires `!state.page`; the only re-add (`:9606`) leaves `state.page` non-null, which forces the `destroy-pending` branch at `:9823-9825`, not `destroyed`. Every orphan carries `"destroyed"`, so no orphan can be in `page.states`. Also eliminated by heap wording (§2). |
| A1 | `m20Q6ConstructionStack` — **strong module-level array** | decl `replay-system.js:9093`, push `:9863`, pop `:9877` | Eliminated | `tx.state = state` (`:9631`) would retain the engine, but the `pop()` at `:9877` is in a `finally` (`:9876-9878`) that also covers the `catch` rethrow at `:9875`. The array cannot retain past construction on any path, including constructor failure. |
| H1 | `MultichartManager.charts` — **strong `Map`** | decl `multichart-manager.js:145`, set `:506`, `:690` | Eliminated **for unboundedness** | String-keyed by `cfg.id`. `removeChart` deletes at `:524` (host) and `:548` (panel), and `addChart` refuses a duplicate id at `:397`, so the map holds at most one entry per panel id and cannot reach 17. Value `{ frame, overlay, mountEl, … }` does hold the iframe element — so a *missed* `removeChart` would retain a whole realm; but that is bounded by the panel-id count, not unbounded per cycle. |
| H2 | `MultichartManager._pendingCmds` — **strong `Map`** | `multichart-manager.js:949`, set `:957` | Eliminated | Keyed by a fresh `requestId` (`:950`), so it *is* unbounded-by-key — but the value `{ resolve, reject, timeout, cmd, panelId }` (`:957-963`) contains no chart, window or engine (`panelId` is a string), and entries are deleted on reply (`:1216`), timeout (`:953`) and send failure (`:981`). |
| H3 | `panelIndicatorMapsRef` / `allMaps` — **strong `Map`** | `TalariaV8bLive.jsx:983`, `:16100`, `:16112`, `:16194` | Eliminated | Keyed by `panelId` (string); values are `Object.create(null)` indicator descriptor bags. Bounded by panel-id count; holds no chart, window or engine. |
| H4 | `MultichartGrid` boot-failure map | `MultichartGrid.jsx:2641` | Eliminated | Keyed by panel `id` (string); value `{ reason, src }` — strings only. |
| F1 | favorites `lease.owners` — **strong `Set`** | `favorites-manager.js:799`, add `:803` | Eliminated as an external root | Holds `FavoritesManager` → `.chart` → H1/H2 → engine, so it is a genuine engine-retaining chain. But the registry WeakMap is installed **on the panel document itself** (`:772-783`, keyed `__talariaFavoritesDragTargetLeasesV1`), and the keys are nodes of that same document. The whole thing lives inside the panel realm, so it is an intra-realm cycle, not a root that outlives the panel. It is load-bearing for §5's "common root" conclusion, not for naming the root. |
| F2 | `_favoritesLeasedTargets` — **strong `Set`** | `favorites-manager.js:803-805` | Eliminated | Per-`FavoritesManager` instance; dies with the chart. Same-realm. |
| M1 | `_panDomOverflowSaved` — **strong `Map`**, object-keyed | `chart.js:27315`, set `:27318` | Eliminated | Keyed by a DOM element of the panel's own document; value is a CSS string. Per-`Chart` instance, same realm, no engine reachable. |
| M2 | all remaining strong `Map`/`Set` in `chart.js` | E1/E2 output: `:74-78`, `:1353-1368`, `:3443`, `:7650`, `:7956`, `:8641`, `:9329`, `:34548`, and ~40 per-call locals | Eliminated | Every one is keyed by a **string or number** (`fileId`, `tf`, `cacheKey`, timestamp, drawing id) or is a per-call local. None is keyed by, or contains, a chart, engine, window or document. |
| M3 | strong `Map`/`Set` in `order-manager.js`, `drawing-tools-manager.js`, `viewport-data-manager.js`, `indicator-lifecycle-store.js`, `tool-lifecycle-store.js`, `talaria-toast-stack.js`, `order-event-bus.js`, `market-calculations.js`, `compare-overlay.js`, `panel-managerv2.js`, `chart-data-pipeline.js` | E3 output | Eliminated | All string/number-keyed (ids, timeframes, event names, prices, pixel slots) and all per-`Chart`-instance or per-call. `screenshot-manager.js:1186-1199` `originalStyles` is object-keyed but is a per-call local holding DOM→string. |
| M4 | `_workerPending` — strong module-level `Map` | `chart-indicators-full.js:7993`, set `:8253`, `:12502`, `:12680` | Eliminated | Keyed by numeric request id; value `{ resolve, reject }`. Module-level and therefore per-realm — it cannot be a root that outlives its own panel. |

---

## 5. Your two eliminations: both correct; the second is incomplete in a way that matters

### 5a. `_talariaInstallMcDiagReporter` / `__mcDiagCollect` — **your elimination is correct**

Verified at `chart.js:1055-1092`. `__mcDiagCollect` (`:1068-1071`) allocates a fresh `charts` array
(`:1069`) and a fresh `new Set()` (`:1070`) on every call and returns the array; it stores nothing on
`target`. `__mcDiagReport` (`:1073-1084`) and `__mcDiagReset` (`:1085-1091`) each call `__mcDiagCollect()`
and keep nothing. `_talariaMcDiagCollectCharts` (`:1034-1053`) is a live traversal that walks
`frame.contentWindow` (`:1048`) at call time. **Nothing is retained between calls.** Confirmed.

**But there is a second-order edge you did not consider, and it is a genuine cross-realm pin.** The three
functions are installed on `window.top` (`:1058-1061`, `:1068`, `:1073`, `:1085`) and are **never removed**;
the install guard `target.__mcDiagReporterInstalled` (`:1065-1066`) is set on `window.top`, so exactly one
realm wins the race, for the lifetime of the top document. A function object created in realm R and stored
on another realm's global retains R's environment chain, which terminates at **R's global object**. So:

```
window.top.__mcDiagCollect            [chart.js:1068]
  → [[Environment]] → global object of the realm that won the install race
  → window.chart                      [chart.js:41936-41937]
  → Chart.orderManager                [chart.js:13311]
  → OrderManager.replaySystem         [order-manager.js:452]
  → a destroyed M20Q6ReplaySystem
```

This is a **complete, source-certain, strong path of exactly the kind M-3 demands** — but it accounts for
**exactly one** realm, permanently, and only if a *panel* rather than the host won the race (the host also
loads `chart.js`, and `_ensureMcDiag` at `:2836-2862` runs in whichever realm constructs a `Chart` first).
It cannot produce 17 engines and it is not unbounded. Report it as a bounded 1-realm pin, not as the row's
mechanism. Your elimination stands for the question you asked it; it is incomplete as a statement about
`__mcDiagCollect` retaining nothing at all.

### 5b. `_mcDiagWrapReplaySystem` — **your elimination is correct**

Verified at `chart.js:2864-2887`. `const chart = this` (`:2867`); the two wrappers
(`:2869-2873`, `:2880-2883`) are assigned **onto the replay instance** (`replay.updateChartData`,
`replay.updateChartDataFast`) and capture `chart` and the original method. The edge is
**replay → closure → chart**, which is the wrong direction to retain the replay system. Confirmed.

One thing worth noting, since it is one line below the code you eliminated: `:2886` calls
`this._installLazyReplayMasterGuards()` (defined `chart.js:7233`), also reached independently at `:13237`.
I checked it for an inbound edge and found none that outlives the panel realm.

---

## 6. Why the root above the panel realm cannot be named from source (task item 6)

The count is unbounded and grows ~3-4 per cycle against 4 panels per cycle, i.e. **essentially every
torn-down panel realm is retained**. So the accumulating container holds *removed iframe realms*, one per
panel per cycle. Every candidate that exists in source is either bounded or conditional:

| Candidate | Site | Why it is not the unbounded root |
|---|---|---|
| `window.parent.addEventListener('mouseup'/'pointerup'/'pointercancel'/'mousemove', end, true)` — panel code registering a **panel-realm closure on the host window** | install `chart.js:27428-27437`, handler `end` `:27409-27420` (captures `self` = the `Chart`) | This is the strongest structural candidate: it is cross-realm, it is *not* routed through `m20Q6AddEvent`, so the M20-Q6 ledger never records it and the drain cannot remove it, and `end → self → orderManager → replaySystem` is a complete path. But it is **not unbounded by construction**: it is installed only from `_beginChartDragPointerTracking` (`:27466-27469`), i.e. only during an active drag; `_removeDragEndGuard` (`:27441-27464`) removes it from the parent at `:27452-27457`; and `end` self-removes on the first parent `mouseup` after the drag ends (`:27410-27412`). It leaks one realm only if a panel is torn down mid-drag and no parent `mouseup` follows. Note `mousemove` is deliberately *not* registered on the parent for embed panels (`:27432-27436`, `_skipParentMousemoveDragEndGuard` `:27395-27403` returns `_isMultichartEmbedPanel()`), which removes the most frequent self-heal trigger — so the window is wider than it looks, but it is still conditional on a drag. **Cannot be asserted as the mechanism without runtime evidence.** |
| `window.top.__mcDiagCollect` / `__mcDiagReport` / `__mcDiagReset` | `chart.js:1068`, `:1073`, `:1085` | Complete path (§5a) but bounded to one realm by the `__mcDiagReporterInstalled` guard at `:1065-1066`. |
| Other panel→host writes | E5 output: `chart.js:480`, `:482`; `drawing-tools-manager.js:230`, `:381-384`, `:477`; `drawing-tools-ui.js:472-473` | All write **primitives** (numbers, strings, booleans) to `parent`/`top`. Primitives retain nothing. `parent.__multichartOpenShapeSettings` (`drawing-tools-manager.js:412`, `:443`, `drawing-tools-ui.js:502`, `embed-bridge.js:205`) and `top.__v9OpenIndicatorSettings` (`indicator-ui.js:1445-1450`) are **read**, never written, by panel code. |
| Host holding a panel `Window`/`Document`/`Chart` | E6 output: ~28 `contentWindow`/`contentDocument` sites in `MultichartGrid.jsx` | Every one dereferences `frame.contentWindow` into a **per-call local** and never stores it. The two `.push` hits are `MultichartGrid.jsx:6589` (`out` is a fresh local array in `enumerateMultichartCharts`, `:6583-6584`) and `TalariaV8bLive.jsx:21336` (`tracked` is effect-local and holds host-realm drawing managers from `window.chart` / `window.panelManager.panels`, `:21341-21344`, not iframe panels). |
| `c.frame.remove()` on teardown | `multichart-manager.js:547` | Detaches the iframe element but never sets `frame.src = 'about:blank'`. Removal alone does not discard the realm if *anything* holds it — consistent with the observed detached `DocumentTimeline` ×15 / `DocumentType` ×15 / `<html class="multichart-embed">`. This is an *enabling condition*, not a retainer. |

**Statement of the negative, per your standing rule.** Searches E1-E6 above, run over
`chart v 1.4/chart/chart.js`, `chart v 1.4/chart/modules/**`, `chart v 1.4/chart/multichart-prod/**` and
`chart v 1.4/talaria-design/src/**` at `cb676b59e`, find **no container or property in source that
accumulates panel realms without bound**. The unbounded root is therefore **not nameable from source at
this commit.** Candidates exist; none can be promoted to "the path" without runtime evidence, and promoting
one is exactly the error that got the previous mechanism merged and refuted.

---

## 7. The documents: retained *alongside* by a common root, not *by* the engines (task item 5)

The answer is stronger than "alongside": the panel document and the destroyed engine are in the
**same strongly connected component**, so neither can be freed without the other.

- engine → document: the engine's DOM (`instance.toolbar` `:9799`, `pickModeOverlay`/`clickCaptureLayer`
  `:9763-9764`, `#replayToolbarClone` `:9761`) are nodes of the panel document.
- document → engine: `Chart.canvas`/`Chart.svg` (`chart.js:1099`, `1114-1119`) and
  `Chart.contextMenu` = `d3.select('body').append('div')` (`chart.js:1141-1147`) are nodes of the panel
  document, whose `ownerDocument`/`defaultView` reaches the panel global, which holds `window.chart`
  (`chart.js:41937`) → `orderManager` (`:13311`) → `replaySystem` (`order-manager.js:452`).
  The favorites lease registry is literally installed **on the document object**
  (`favorites-manager.js:772-783`) with `lease.owners` → `FavoritesManager` → `.chart` (row F1).
  `chart.js:13286-13290` adds `pagehide`/`beforeunload`/`visibilitychange` handlers capturing `this`
  to the panel's own `window`/`document`, outside the M20-Q6 ledger, so they are never removed.

So one root retaining any member retains all of them. **This favours a fix at the realm boundary (make the
panel realm collectable) or at H1/H2 (release `orderManager.replaySystem`), and rules out a fix that only
detaches DOM from the engine.**

**On the ~15 documents vs 17 engines gap:** 17 > 15 is expected, not contradictory. `M20Q6ReplaySystem`'s
constructor drains and replaces a prior owner of the same chart with reason `'replacement'`
(`replay-system.js:9858-9860`), and `initReplaySystem` can run more than once per realm
(`chart.js:13294-13298` re-arms it on `DOMContentLoaded`). Each replacement leaves an additional engine
carrying `"destroyed"` inside the *same* document, while `chart.js:13311` overwrites `this.orderManager`
with a new one. That yields more destroyed engines than documents, with the surplus concentrated in
whichever realms re-initialised — which is exactly the 17-vs-15 shape.

---

## 8. FALSE PREMISE (BRIEF-02): line numbers in the originating finding

Confirmed as stated in the packet, and recorded so the next reader does not re-derive it: the finding's
citations are offset from this branch, but **not uniformly**. `_mcDiagWrapReplaySystem` is at
**`chart.js:2864` on this branch**, which is the number the packet itself uses — so the "+217" offset does
not apply to it. `_isMultichartEmbedPanel` is at `:2829` and `_ensureMcDiag` at `:2836`.
**Do not arithmetic-correct the finding's line numbers; locate by content.** This is the finding's third
recorded inaccuracy on this row (twice on line numbers, once on mechanism), and §1/§2 add a fourth
inaccuracy, in the PO's transcription of the heap edge.

---

## 9. What evidence would name the root — one reading of the snapshot the PO already has

No new test round is required. All three items below are readings of the **existing** `sessionId=888`
520 MB snapshot.

1. **Expand the retainer chain of the detached `<html class="multichart-embed">` node (or of any detached
   panel `Window`) to the GC root, and paste the full chain.** This is the single decisive reading. It
   names the root directly. Ask for the chain to be expanded to the root marker, not truncated — DevTools
   collapses long chains by default, and the truncation is what has been hiding this.
2. **On any one orphaned `M20Q6ReplaySystem`, read the retainers pane and report every *incoming* edge
   name.** The prediction from §3 is falsifiable and specific: the incoming edges should be
   `replaySystem in OrderManager` and `replaySystem in OrderService`, and **not** `replaySystem in Chart`.
   If `replaySystem in Chart` appears, the drain did not complete on that instance and §3 is wrong.
   If neither OrderManager edge appears, H1/H2 are wrong and I want to know before anything ships.
3. **Confirm the ephemeron reading of §1** by asking whether the edge the PO transcribed reads
   `pair in WeakMap (table @…)` in the raw snapshot. If it does, §1 and §2 are settled and no further
   argument about the `Set`s is needed.

Item 2 alone converts §3 from "source-certain" to "heap-confirmed", and it is a single pane read on a
snapshot that already exists.

---

## 10. Scope discipline

- **No fix proposed or written.** Naming the path was the deliverable; §3 names it and §6 states plainly
  what is not nameable. No product code was modified.
- **Read-only.** The only file written into any git tree is this one. The V8 probe in §1 wrote a
  `.heapsnapshot` to `%TEMP%` and deleted it; nothing was executed against, or written into, product code.
- **Main checkout untouched.** `manager-c/verification-infra` was never checked out or stashed. Its
  `git status --porcelain` count was **163 at start** and is re-reported at the end of this packet.
