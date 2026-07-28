# Superseded seal — c22c3a9a7

`MANIFEST.superseded-c22c3a9a7.json` is a real seal, retained rather than deleted.

It was written before I noticed that `b-w18-killswitch.mutants.mjs` — the harness
that certifies the two kill-switches — was itself outside the sealed file list. A
later run could therefore have rewritten the mutation set proving the levers work
while verification still reported clean. That is the EVID-01 hole this tool exists
to close, present in the tool's own coverage.

The live seal is `MANIFEST.json`, pinned to the commit that fixes the list. This
file is kept because deleting a superseded seal and writing a replacement in its
place is indistinguishable, after the fact, from never having sealed the earlier
state — which is the failure mode EVID-01 names.

---

# Superseded seal — b6d94c767

`MANIFEST.superseded-b6d94c767.json` / `SHA256SUMS.superseded-b6d94c767` are a real
seal, retained rather than deleted.

Superseded because the sealed set pinned source bytes but said nothing about the
**cache stamp**, which is a build argument rather than a file. Building strictly
from that sealed train reproduced the hazard it was supposed to prevent: with
`BUILD_ID` unset the bump script increments the committed `b61` to `b62`, behind the
`b80` already served, so the guard would have shipped at a URL the edge answers from
cache.

The replacement seal adds `BUILD-PARAMS.json`, pins `CHART_BUILD_ID=20260728b81`,
records the floor in the manifest, and makes `record-build` refuse anything at or
below it. Kept for the same reason as the first superseded seal: a replaced seal
that leaves no trace is indistinguishable from never having sealed the earlier state.
