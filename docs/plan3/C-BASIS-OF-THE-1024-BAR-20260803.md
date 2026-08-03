# What basis is the 1,024 MB bar defined on? — and the answer flips the verdict

**C, 2026-08-03 21:10+01:00.** Written for the Director to take to the PO. Treated as a soak blocker:
the soak's headline metric is measured against this bar, and as things stand the metric cannot be
falsified because the quantity it compares against has no stated definition.

---

## 1. The short answer

**Both numbers are on the same basis, and that basis is the widest one available.**

Every figure we have compared against the bar — 1,122.1 MB at CONF-01 first paint, 1,395.9 MB at N1
first paint, 1,032.0 MB post-drain, 674.9 MB canonical floor — comes from `scripts/lib/footprint.mjs`,
which sums the **OS private working set across every Chrome process**. GPU process, browser process,
network service, utility processes and the three spare renderers are all inside it.

So the two bases do **not** differ, and that is not the reassurance it sounds like. **The bar's basis
was never defined.** It was inherited from whichever gauge happened to be in the instrument that first
compared against it. Nobody chose it, so nobody can be wrong about it — which is exactly what makes
the metric unfalsifiable.

---

## 2. The number on both bases

From `_evidence/manager-C/N1-HEAVY-VS-FRESH.json`, b121, per-process rows measured not inferred:

| | heavy account | fresh account |
|---|---|---|
| **all-Chrome first paint** | **1,395.9 MB** — bar **+371.9** | **1,387.4 MB** — bar **+363.4** |
| **page renderer only** | **915.9 MB** — bar **−108.1** | **915.1 MB** — bar **−108.9** |
| all-Chrome post-drain floor | **1,032.0 MB** — bar **+8.0** | **1,041.4 MB** — bar **+17.4** |
| page renderer at floor (**estimated**) | ~552 MB | ~569 MB |

**The verdict flips on the definition.** On the all-Chrome basis the product breaches the bar at first
paint and still breaches it by 8.0 MB after a full drain. On the page-renderer basis it comes in
**108.1 MB under the bar** at first paint, before any drain at all.

### What the 480 MB is

The gap between the two bases at first paint, heavy account:

| component | MB | do we author it? |
|---|---|---|
| GPU process | 306.0 | no — Chrome's rasteriser and texture pool |
| browser process | 62.8 | no — Chrome's own UI and coordination |
| spare renderers | 60.9 | no — three blank processes with no page content |
| utility / network service / other | 50.3 | no |
| **total not authored by us** | **480.0** | **34.4% of the first-paint figure** |

The spare-renderer row is the clearest case: W90 measured those three processes at 19–21 MB each with
**no page content in them at all**. They exist because Chrome keeps them, and no fix we can write
removes them.

**The 8.0 MB post-drain breach is 1.7% of the 480 MB of Chrome infrastructure sitting inside the
measurement.** A definition change moves the verdict by forty-five times the size of the breach.

---

## 3. What I cannot tell you, stated plainly

1. **CONF-01's 1,122.1 MB has no recorded per-process split.** Same gauge, so same all-Chrome basis —
   that part is certain. But I cannot give you its page-renderer figure, because that run recorded
   only the total. If CONF-01's non-authored overhead resembles N1's (~472–480 MB), its renderer share
   would be roughly 640–650 MB, and that is an inference, not a reading.
2. **The post-drain page-renderer figures above are estimates**, marked as such. The floor's
   per-process split was not recorded either; I subtracted the first-paint overhead on the strength of
   W90's finding that the GPU process is near-fixed. The estimate is good enough to show the verdict
   flips and not good enough to publish as a floor.
3. **N1 is b121 with 6,524 resident bars.** CONF-01's 1,122.1 MB is a different build and a different
   configuration. They are two readings of the same gauge, not two readings of the same thing.
4. Worth noting against all of the above: **the b126 canonical floor is 674.9 MB all-Chrome**, which
   does not breach the bar on either basis. The breach figures are b121's.

---

## 4. The question for the PO

**Is the 1,024 MB bar a budget for what Talaria allocates, or for what a machine running Talaria
spends?**

Both are legitimate and they are different products:

- **Authored basis (page renderer).** Measures what we can fix. Excludes 480 MB we cannot. Today's
  answer would be *under the bar by 108 MB at first paint*.
- **Total basis (all-Chrome).** Measures what the user's machine actually pays, which is what a user
  notices. Today's answer is *breached at first paint and by 8.0 MB after a full drain*.

My recommendation, offered as a recommendation and not as a finding: **state the bar on the total
basis, because that is what the user experiences, and carry the authored figure beside it as the
number we are accountable for improving.** One number tells you whether the product is acceptable; the
other tells you whether we are making progress. Collapsing them into one figure is what produced a
metric that has been quoted all week without anyone being able to say what it measures.

Whichever is chosen, **it needs writing down**, and every instrument that compares against the bar
needs to name the basis in its own verdict line — the same discipline as TOTAL-01, for the same
reason.

---

## 5. Why this is a soak blocker

The soak's headline is total growth measured against this bar. If the bar is on the total basis, a
ten-hour arm is partly measuring Chrome's GPU pool and spare renderers, and a fix that reclaims 50 MB
of authored memory can be masked by GPU behaviour we do not control. If it is on the authored basis,
the current published breach evaporates and the soak is measuring a product that is already inside
budget at boot.

Those two soaks have different success criteria and different conclusions from identical data. Firing
before the definition exists means running the most expensive measurement of the week against a
question we have not finished asking.
