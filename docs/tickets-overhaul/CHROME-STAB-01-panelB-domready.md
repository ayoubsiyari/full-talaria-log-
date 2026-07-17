# CHROME-STAB-01 — panel-B dom-ready flake stabilization (D-032 rider 1)

Named tracked item that **H-R05** (and the H-R09-LR residual) are bound to. H-R05 remains a
**FAILING acceptance row** on the scoreboard — NOT green, NOT quarantined (D-027 exclusion stands).
This item exists so the flake is a tracked debt with a review point, not permanent background noise.

## Symptom / signature (the ONLY exonerating signature — D-032 rider 3 tripwire)
Panel-B chrome dom-ready timeout after iframe single-click select:
`storeOk=true`, `v9BarVisible=false`, **no modal teardown**, recovers on double-click.

**Tripwire (blocker class):** if ANY failing H-R04/H-R05/H-R09 run shows the **D-026 teardown
signature** or `storeOk=false`, the D-032 decouple is VOID → transport regression → same-day
escalation. Lane 4 logs the signature on every failing run so this is checkable.

## Candidate mechanism
Deeper dom-ready barrier: the current `waitForParentV9ChromeInteractive` / D-024 wait signals
interactive before the parent `#v9-tl-bar` is committed under load. Candidate = a stronger
commit-confirmed barrier (rAF-after-paint + element-present assertion) before the ready signal,
harness-side, with product-side live-resolve (V1) already landed as backstop.

## Owner / review
- Owner: Lane 4 (harness barrier) with Lane 1 backstop (live-resolve V1 already shipped).
- Review point: **post-bless T8 sweep**, alongside the quarantine rows (D-032 rider 4).
- Exit: genuine simultaneous 10/10 on H-R04/H-R05/H-R09/H-R09-LR → H-R05 flips to CLOSED-VERIFIED.

## NOT permitted
- No "≥9/10 counts" standing rule (D-032 rejects Option 3).
- No quarantine of H-R05 (it's an acceptance row).
- No marking H-R05 green until true 10/10.
