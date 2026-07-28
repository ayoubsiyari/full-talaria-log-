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
