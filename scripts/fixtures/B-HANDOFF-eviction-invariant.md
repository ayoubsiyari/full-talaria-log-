# B-OREI handoff - order-line registry eviction invariant gate

**From:** Manager B (technical author of record)  
**To:** Manager C (verification infrastructure owner)  
**Port:** `scripts/order-registry-eviction-invariant.mjs`  
**Signature:** `TALARIA_ORDER_REGISTRY_EVICTION_V1`

## 1. What the invariant is

Every site that removes entries from the `orderLines` registry must remove exactly the rows it disposes: **removal set equals disposal set**. The gate inventories whole-array `.filter(...)` reassignments, parses each eviction predicate in a restricted expression grammar, evaluates it over a closed universe of synthetic row objects, and compares the rows the filter would drop against the rows the enclosing code disposes.

The disposal set is either a binding-linked `.forEach` collect-set, or a single row named by the disposal call immediately preceding the eviction. No product code is executed. No browser is launched. Source text is read; predicates are interpreted.

## 2. What Manager C changed

This scripts/ port closes B's G1. Discovery now ranges over all configured source files in `meta.sources` and recognizes both assignment shapes:

- `this.orderLines = ...`
- `<ident>.orderLines = ...`, including `orderManager.orderLines = ...`

The fixture now lists `order-manager.js` and `drawing-tools-manager.js`. Site identity is global ordinal in source-list order, plus source id, enclosing method, and ordinal within that method.

## 3. What remains unchanged

The semantic interpreter model remains B's model: predicate parsing and evaluation over an enumerated row universe, not substring matching. The self-test corpus still includes the wrong historical variant `(ol.isPending || true)` and requires it to be rejected.

The §A15.3 NOT-BEHAVIOUR-COVERING stamp remains in the script header. A green run remains structural evidence only, not host/panel/browser behavior.

## 4. Known blind spots after this port

G1 is closed for the configured whole-array writer sources. The remaining fixture gaps are unchanged:

| Gap | Meaning |
|-----|---------|
| **G2** | One grammar only. Only whole-array `.filter()` reassignment is inventoried. Other mutation forms are not detected. |
| **G3** | Wholesale resets are counted, not checked. |
| **G4** | No execution. No real frame, row, or branch reachability is observed. |
| **G5** | Disposal is assumed from source shape, not observed in the DOM. |
| **G6** | Finite row universe. Bugs outside the enumerated worlds can pass. |
| **G7** | Free-identifier meanings remain premises. |
| **G8** | The `ol.chart || this.chart` fallback world is excluded. |
| **G9** | Consistency, not intent. Equal wrong sets can pass. |
| **G10** | Deliberately over-strict source shapes fail closed. |
| **G11** | No exemptions. Unknown fixture keys fail closed. |

## 5. How to run

From repository root:

```bash
node scripts/order-registry-eviction-invariant.mjs
```

Useful proof-run overrides:

```bash
node scripts/order-registry-eviction-invariant.mjs --fixture=<path> --sources=<a,b>
node scripts/order-registry-eviction-invariant.mjs --fixture=<path> --source=<path>
node scripts/order-registry-eviction-invariant.mjs --invert=B-OREI-05
```

Exit code is 1 on any failing cell. A live RED is valid evidence that a configured source violates the structural invariant or uses an unmodelled shape; do not weaken the invariant to make it green.
