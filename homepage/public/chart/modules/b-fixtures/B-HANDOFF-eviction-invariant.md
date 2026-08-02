# B-OREI handoff — order-line registry eviction invariant gate

**From:** Manager B (technical author of record)  
**To:** Manager C (verification infrastructure owner)  
**Artefacts:** `b-order-registry-eviction-invariant.red.mjs`, `b-fixtures/order-registry-eviction-sites.json`

---

## 1. What the invariant is

Every site that removes entries from the `orderLines` registry must remove exactly the rows it disposes — no more, no less. Formally: **removal set equals disposal set**. The gate inventories `this.orderLines = <filter chain>` assignments in one product file, parses each eviction predicate in a restricted expression grammar, evaluates it over a closed universe of synthetic row objects, and compares the rows the filter would drop against the rows the enclosing code disposes (either a binding-linked `.forEach` collect-set, or a single row named by the disposal call immediately preceding the eviction).

## 2. Why it exists

Two independent files were found corrupting the same registry the same way: removing rows keyed on `orderId` alone without discriminating pending from executed rows. A pending row and an executed row can share the same `orderId` (`removeOrderLine` documents this). Evicting on id alone therefore drops both while disposing only one. `updateOrderLines` never creates order lines (no draw/append call), so once a row leaves the registry nothing in the frame loop restores it — the row's UI is permanently gone until reload. The dual hazard (a disposed row left *in* the registry as a zombie) is also real but is bounded by the same set-equality property.

## 3. How it works

1. **Discovery** — scan masked source for `this.orderLines = …` writes; classify as wholesale reset, filter-chain eviction, or unmodelled shape (unmodelled shapes fail the gate).
2. **Parser + interpreter** — each eviction predicate is parsed as a single-parameter arrow with a restricted grammar (no calls, block bodies, template literals, etc.); anything outside the grammar fails closed.
3. **Closed row universe** — 3 order ids (target, numeric twin, unrelated) × 2 pending states × 4 chart slots × 2 encodings of "not pending"; property reads outside `{orderId, isPending, chart}` raise `ModelError`.
4. **Disposal linkage** — collected-set sites require the collect-filter result array to be the actual `.forEach` receiver; single-row sites require the disposal call immediately before the eviction and derive the pending branch from enclosing `if (isPending)` / `else`.
5. **Verdict** — for each site, `removedSet(chain) === disposalSet` in every world; mismatch fails the gate.

No product code is executed. No browser. Source text is read; predicates are interpreted.

## 4. Why it must be generalised — the specific gap

The gate currently scans **one file** (`order-manager.js`). The same `orderLines` registry is also evicted from `drawing-tools-manager.js` at approximately lines **12088** and **12133** (`orderManager.orderLines = orderManager.orderLines.filter(...)`; the second site keys on a `removedIds.includes(...)` set built elsewhere in the block). Those sites are invisible to a gate scoped to one file (gap **G1**). That second writer is the reason for this handoff: a shared-registry invariant must be scoped to the data structure, not to any one territory file.

## 5. Known blind spots

Read together with the §A15.3 stamp in the gate header and `meta.notEnforced` in the fixture.

| Gap | Meaning |
|-----|---------|
| **G1** | One file only. `drawing-tools-manager.js` evictions at ~12088 and ~12133 are not scanned. |
| **G2** | One grammar only. Only `this.orderLines = <filter chain>` is inventoried. `splice`, `pop`, `shift`, `delete`, `length = n`, reassignment from `map`/`reduce`/`concat`/`slice`, or mutation through a local alias are not detected at all. |
| **G3** | Wholesale resets counted, not checked. `this.orderLines = []` drops the entire registry with no disposal analysis; only the count is pinned (`wholesaleResetCount: 5`). |
| **G4** | No execution. No real frame, row, or branch reachability is observed. |
| **G5** | Disposal assumed, not observed. The gate matches disposal call *name* and loop *shape*; it does not verify DOM detachment or model `try/catch` swallowing a throw. |
| **G6** | Finite row universe. A predicate wrong only outside the enumerated worlds (fourth chart, truthy non-`true` `isPending`, duplicate rows sharing all three modelled attributes) is accepted. |
| **G7** | Order of sites only (header) / premised bindings (fixture G7). Site identity is ordinal + enclosing method; free-identifier meanings (`orderId`, `ch`) are premises, not derived from source. |
| **G8** | The `ol.chart \|\| this.chart` fallback is not covered. The gate accepts rewriting `updateOrderLines` predicates to plain `ol.chart === ch` because the problematic world is excluded from the model. |
| **G9** | Consistency, not intent. Narrowing both collect and eviction by `&& ol.isPending` is accepted if removal still equals disposal — the gate never proves the agreed set is what the caller wanted. |
| **G10** | Deliberately over-strict. `for...of` disposal, disposal behind `if`, statement between disposal and eviction, block-bodied predicate, or call inside predicate all fail even when code is correct. |
| **G11** | *(fixture only)* No exemptions. Unknown keys in `meta`, sites, or disposal blocks are rejected; there is no field to mark a site exempt. |

## 6. How to run

From repository root:

```bash
node "chart v 1.4/chart/modules/b-order-registry-eviction-invariant.red.mjs"
```

**Overrides** (for testing variants against temp copies):

| Flag | Purpose |
|------|---------|
| `--source=<path>` | Override product source (default: `chart v 1.4/chart/modules/order-manager.js`) |
| `--fixture=<path>` | Override fixture JSON (default: `b-fixtures/order-registry-eviction-sites.json`) |
| `--invert=<cellId>` | Invert one cell's assertion (proof runs only; e.g. `--invert=B-OREI-05`) |

Exit code **1** on any failing cell. Expected healthy run: **6 passed, 0 failed**, exit 0 (cells B-OREI-01 through B-OREI-06).

## 7. History a maintainer needs

The **first version** of this gate decided correctness by **substring matching** — it looked for `<param>.isPending` in the first filter predicate and checked polarity by nearby `!`. Adversarial review (`B-R1`) built **19 wrong variants** of the real source; the gate **accepted 13 at 6/6 PASS**, including `(ol.isPending || true)` — dead, behaviourally identical to the original bug. It also **rejected three correct rewrites**, including the strictly minimal fix `(ol) => ol !== olEntry` and computed access `ol['isPending']`. Cell 06 (disposal linkage) was defeated by a one-line `return` inside the genuine disposal loop.

The **current version** interprets predicates rather than pattern-matching. Its self-test corpus (`B-OREI-01`) encodes the 13 formerly-accepted wrong variants as required rejections. **Any future change to the gate must be re-attacked with a case outside its own acceptance suite before being trusted** — the lesson of the substring era is that a green gate that looks rigorous can carry near-zero information about the invariant it names.

---

*Manager B remains author of record for the gate design and fixture semantics. Manager C owns verification infrastructure scope and generalisation to multi-file registry coverage.*
