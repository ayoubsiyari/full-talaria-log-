# ANSWER — The element writer is React in the host, but "per closed trade" is confounded and elements cannot be the 730 MB/h

**2026-07-30 23:15** · Manager A · to Director and C · re the 22:05 dispatch (React reconcile path)
and C's `FINDING-C-THE-ELEMENT-WRITER-IS-REACT-COMPLETEWORK-IN-THE-HOST-PAGE-20260730-2300`

Static only. **No browser was started** — constraint 1 respected throughout. Everything below is
a regrade of artifacts already on disk. Reproducer: `scripts/ewa-regrade-drivers.mjs`.

## 1. I confirm C's demangle independently, and C's is the better-evidenced one

I resolved the three minified frames before reading C's 23:00 finding, from the **local** bundle,
and reached the same structural conclusion: all three frames are React vendor code, so the
attribution names the **mechanism**, not a component.

My evidence was the content of line 40 rather than the names: `memoizedState` ×90, `stateNode`
×78, `flags` ×127, `lanes` ×53, `alternate` ×36, and React's insertion primitive
`function uk(t,n,i){...i.insertBefore(t,n)...n.appendChild(t)...}` — against **`document` ×0 and
`useState` ×0 on the same line**, with `function` ×302 as the positive control proving the matcher
worked. Line 40 contains no product code at all.

**C's demangle is better than mine and supersedes it on the naming.** C mapped
`R_`→`performUnitOfWork`, `O_`→`completeUnitOfWork`, `R3`→`completeWork` against the **deployed**
bundle. I read the local copy, where those same short names bind to unrelated functions (`O_` and
`R_` are `.click()` dispatchers at line 143, which create no elements). The local bundle is
1,716,061 bytes against C's deployed 1,720,325 — **the local tree is behind deployment again**,
the same row I keep filing against my own briefs. C checked the byte count and I did not.

C's accompanying reasoning is correct and is the most useful sentence in the packet: React creates
host instances in `completeWork`, after the rendering component has returned, so **no creation
stack can ever name a component**, and the fiber walk C has already written is the right and only
instrument. I have nothing to add to that and I am not duplicating it.

## 2. "+28.7 per closed trade" is confounded. The control in C's own data shows it

Trades closed at a near-constant ~3/min for the entire run and **no interval had zero closes**, so
in levels, time and trade count are collinear and the levels fit cannot separate them — which is
why it reports R² 0.9995 against trades and R² 0.99998 against time simultaneously. First
differences do separate them, and C's artifact carries a natural positive control: the d3
`defs`/`filter` pair, a writer that genuinely fires on trade close.

| trades closed in interval | n | React writer, elements added | d3 `defs` added (**control**) |
| --- | --- | --- | --- |
| 1 | 1 | 89.00 | 4.00 |
| 2 | 2 | 88.00 | 4.50 |
| 3 | 18 | 87.00 | 5.94 |
| 4 | 3 | 86.00 | 7.33 |

`corr(ΔReact, Δtrades) = −0.9042`. `corr(Δdefs, Δtrades) = +0.6678`.

A 4× swing in the predictor moves the React writer by 3.5%, **downward**, while on the same
intervals with the same sampling noise the control scales upward as a per-trade writer should.
The analysis can see a per-trade writer when one is present; this one does not behave like one.

**What this does and does not license.** It does *not* prove the writer is time-driven. A
per-trade writer that fires with a lag would also decorrelate, and a smooth response against a
phase-noisy counter can produce exactly this pattern. What it does establish is that
**the per-trade attribution is unproven**, and therefore three inferences resting on it are also
unproven:

- C's "this retires the rewind hypothesis as the element cause (a rewind would give a time-driven
  climb; this is trade-driven)" — the premise is the thing in question. **The rewind hypothesis is
  not retired.**
- C's "the app is rendering an unbounded list … a different defect from a teardown bug."
- The Director's dispatch premise that the failure mode is React re-mounting per closed trade.

**The decisive test is trivial, cheap, and unrun: one segment with the replay advancing and no
trades closing.** It separates the two in a single measurement. It should be a segment of C's
already-planned `--no-synthetic` re-run, not a new run.

## 3. Elements cannot be the 730 MB/h. This is a unit check, not a statistical one

The duration gate (e8ba8bdbc) pairs **renderer footprint +735.0 MB/h** with **DOM elements
+1333.5/h** and reads the pairing as making element growth "the leading candidate for the same
slope." Divide them:

- point estimate: **564 KB per element**
- the corner of both CIs most favourable to the hypothesis (`120.4 MB/h` over `2376.2 elem/h`): **51.9 KB per element**
- using C's faster host figure (5,224 elem/h) instead: **144 KB per element**

An attached DOM element costs single-digit KB including its layout box and computed style. At a
generous 4 KB:

| element slope | implied MB/h | share of the +735 MB/h |
| --- | --- | --- |
| duration gate, 1,333.5/h | 5.2 MB/h | **0.71%** |
| C's attribution, 5,224/h | 20.4 MB/h | **2.78%** |

**The element climb accounts for roughly 1–3% of the renderer slope.** It is a real defect and
worth fixing on its own merits — an unbounded attached list is a genuine bug — but fixing it will
not move the duration gate, and we should expect the gate to stay RED afterwards. If we ship an
element fix as the answer to 730 MB/h we will spend a CKPT-01 checkpoint and a canary slot to buy
about one percent.

Worth flagging separately: the two instruments disagree about the element slope itself by ~4×
(1,333/h vs 5,224/h) on different runs. Not resolved here.

## 4. What the instrument can and cannot see, which changes where the memory is

The census is `document.querySelectorAll('*')` — it counts **attached** elements only
(`scripts/element-writer-attribution.mjs:171`). So C's "live count" label is accurate, and the
2,280 figure is genuinely retained-and-attached, not create-and-release.

The consequence is the useful part: **detached-but-retained nodes are invisible to this
instrument.** The Director's stated failure mode ("re-mounting … leaving previous nodes attached")
would be visible; E's separate finding ("a removal misses detached nodes") would **not** be. A
detached subtree still held by a JS reference costs full renderer memory and contributes zero to
this census. Given that attached growth is ~1–3% of the slope, **detached retention is where the
remaining 97% would hide, and nothing currently measures it.** That is the instrument gap I would
close next, and it is a heap-snapshot question (retainer paths to `Detached HTMLElement`), not an
element-census question.

## 5. Correcting my own earlier answer

`ANSWER-A-ELEMENT-CLIMB-IS-HISTORY-MARKERS-PLUS-UNSHIPPED-GLOW-20260730-2210` attributed the climb
to order history markers plus unshipped glow. C's direct measurement does not support the history
marker half — **no order-manager writer appears in the climber list at all**. That half was
inference; C measured. I withdraw it.

The glow half survives and is corroborated: `SVGDefsElement` and `SVGFilterElement` at ~2.0 each
per closed trade, always in equal numbers, which is exactly the `defs`+`filter` pair shape. That
fix is already built and routed (`fdda39a3b`, on its own base per
`ROUTE-A-TO-B-GLOW-GC-SHIPS-FROM-ITS-OWN-BASE-20260730-2245`). It is also, on C's own numbers, the
**only** part of the element climb that currently has a shipped fix.

## 6. What I am doing next

Continuing the element hunt statically — it is a real defect regardless of its memory share, and
the component owner is findable from source without a browser. Two read-only source sweeps of
`chart v 1.4/talaria-design/src` are running: one for per-closed-trade React accumulation and
unstable/index keys, one for retention mechanisms (ref maps never deleted, listeners never
removed, portals never unmounted).

Ownership note: `talaria-v9-live.js` is build output of `talaria-design/src`
(`vite.config.live.js:142`, `emptyOutDir: true`), so **any fix lands in `talaria-design/src`, which
is B's tree.** Editing the bundle in my tree would be erased by the next build. I will produce the
diagnosis and the kill-switch design; the landing routes to B.

**Two asks.**

1. **C** — add a no-trades-closing segment to the `--no-synthetic` re-run. It costs one segment and
   it converts the top writer's driver from contested to settled. The fiber-owner census you have
   already written is the other half and I am not duplicating it.
2. **Director** — the element hunt should not be funded as the 730 MB/h answer. It is ~1–3% of the
   slope by unit arithmetic that does not depend on any contested statistic. I will keep working it
   as a correctness defect, but the memory campaign needs the detached-retention question opened,
   and that is a different instrument.
