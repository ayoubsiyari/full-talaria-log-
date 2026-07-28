# RULING — B proved a warm browser runs the 24 May engine inside multichart panels while a cold one runs `b75`. I must withdraw my claim from 21:10 that the memory work was unaffected. Every multichart measurement we have is provisionally suspect, stamping `../chart.js` becomes the highest-value change in the project, and M7 must not disclose a multichart ceiling until we re-measure.

**2026-07-28 21:22. Evidence: `DEFECT-ONE-COLD-WARM-ENGINE-20260728-2112.md`, `diverge: true`.**

---

## 1. B's result

| Browser state | Engine loaded inside a multichart panel |
|---|---|
| **Cold** | `20260726b75` |
| **Warm, stale-seeded cache** | **`20260524a10-SEED`** |

**Two months of engine divergence, decided entirely by browser cache state, because `chart-host.html:294` loads `../chart.js` with no `?v=` stamp.**

## 2. Withdrawal — my 21:10 claim was wrong

**I wrote, eleven minutes ago:** *"It does NOT invalidate the memory work… panels do load `chart.js` at a current version on a cold cache. A's M26 and M27 work remains correctly aimed."*

**That sentence rested on the cold-cache case and quietly assumed it was the normal one. B has now shown the warm case serves May code, and the PO's browser has been in continuous use for weeks.**

**So the honest position is: we do not know which engine the PO's multichart measurements were taken against.** The 4→17 orphaned engines, the 50% slowdown, the 954 MB heap growing at 15.9 MB/s, the detached documents — **each was measured in a warm browser and may have been measured against 24 May code.**

**I am not claiming they were.** I am recording that **we cannot tell, and that I asserted otherwise without cause.** This is the third time today I have stated something confidently that the next measurement contradicted, and it is the most consequential of the three.

## 3. What this reprioritises — the stamp goes ahead of both lag fixes

**Ruling: stamping `../chart.js` in `chart-host.html` is now the single highest-value change in the project, ahead of FIX 1 and FIX 2.**

**The reasoning is a dependency, not a preference.** **Every fix A has landed in `chart.js` today — M26, M27, M28, the six kill-switches — is invisible inside multichart panels on any warm browser, and will remain invisible after we push, because an unstamped URL is never cache-busted.** So:

**FIX 1 and FIX 2 cannot reach warm-cache users at all until the stamp lands.** Building them first would be building fixes that cannot be delivered. **The stamp is upstream of the entire performance programme.**

**It is also cheap.** One attribute on one line, plus the coherence gate C already owns.

## 4. What this does to our measurements and to M7

**Ordered: every multichart number we hold is marked provisional pending re-measurement on a stamped build.**

**And the trap I have now walked into twice must not be walked into a third time.** With idle CPU, we nearly disclosed an architectural limitation that was a replay bug. **Here we were about to disclose a multichart performance ceiling that may be an artifact of panels running a two-month-old engine.**

**Ruling: M7 must not state a multichart performance ceiling until the PO has re-measured on a build where the panel engine is stamped and verified current.** If the numbers hold, we disclose them with confidence. If they improve, we would have defamed our own product in writing.

**The PO will need to re-run the four-panel measurement after the stamp lands. That is unavoidable and it is the only PO test that matters now.**

## 5. A second occurrence of one pattern — manifest exclusion hiding a live surface

**B's note: the inventory *"even had it as `denied-route-pending`"*.**

**So the route was known and marked excluded, and every gate skipped it on that basis.** **This is the second time today.** The loader gate skipped `legacy-index.html` because the manifest marked it excluded, while the route was genuinely servable.

**Ruling — `INV-01`: a manifest exclusion is a statement of intent, never evidence that a route is unservable. Any route marked excluded must be probed against the running host, and a route that answers must be treated as in scope regardless of what the manifest says.**

**Both of today's worst delivery defects were hidden by exclusions we wrote ourselves.** An audit cannot find what its own inventory has already dismissed.

## 6. B's standing change is ratified

**`stamp-census.mjs --emit-shell-inventory` producing `scripts/servable-shells-from-census.json` becomes the shell inventory for cache-stamp, module-presence and reachability gates. C consumes it. Hardcoded lists are retired.**

**This is the correct structural answer to §5** — an inventory derived from what the server answers cannot dismiss a route the server is serving.

## 7. Note on B's performance this hour

**Between 20:18 and 21:13, B held the push correctly against my own ratified assembly, held a 404 that would have broken multichart, built a census that found three holes, proved a two-month engine divergence with a cold/warm experiment, and proposed the structural fix for the class.**

**Two of my rulings this hour were corrected by B's measurements. Both corrections were right.**
