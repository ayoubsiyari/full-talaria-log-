# SUPERSEDED — `/chart/multichart/` is a dead prototype (WITHDRAWAL 21:45)

**Original escalate (21:05)** assumed live panels resolve to `chart-host.html` (a10).  
**Director WITHDRAWAL 21:45** retracts that premise. Production panels use
`MultichartGrid` → `/chart/multichart-prod/chart-embed.html` (observed on running host).

**Current action:** nginx **302** `^~ /chart/multichart/` → `/chart/dist-v9/index.html`
(see `P6-REMEDY-REDIRECT.md`). Not a 404; not a shell repair.

`diverge: true` from the cold/warm probe remains valid evidence that the **prototype**
route can diverge — it is not a claim about production panels.
