# TAL-01934 broad MC baseline pair

Candidate tip: `dbea94937`
Coherence base: `f4a5686cf`

## Candidate suite outcome

Command: `node run.mjs` under `chart v 1.4/chart/multichart-prod/harness`
Log: `%TEMP%\tal01934-candidate-mc.log`

- Observed `RESULT` rows: 95 (`PASS=49`, `FAIL=46`)
- Suite did **not** emit a clean `FINAL` summary.
- From `H-S75` onward the runner repeatedly threw `ConnectionClosedError: Connection closed.` while opening pages.
- Process then aborted cleanup with `EBUSY` on a Puppeteer profile `first_party_sets.db`.

Therefore late FAIL rows (`H-S74`–`H-S86`, `H-A1-B`, `H-S82`) are **infrastructure-contaminated** and must not be attributed to the committed-paint crosshair correction.

## Pre-crash FAIL set that overlaps known baseline real bugs

These failed before the connection collapse and match / remain inside the previously observed broad-MC real-bug surface:

`H-S6`, `H-S17`, `H-S19b`, `H-S20`, `H-S23`, `H-S25`, `H-S30`, `H-S32`, `H-S33`, `H-S35`, `H-S44`, `H-S45`, `H-S46`, `H-S47`, `H-S48`, `H-S49`, `H-S50`, `H-S59b-coarse`, `H-S60`–`H-S73`

Notable non-regression before collapse: `H-S21` was `PASS` in this candidate run.

## Clean paired subset

The same 32 pre-crash broad-MC scenarios were then run from both the
coherence base and candidate with identical `--only` arguments:

- Base log: `%TEMP%\tal01934-base-mc-pair.log`
- Candidate log: `%TEMP%\tal01934-candidate-mc-pair.log`
- Both runs emitted 32 complete `FINAL` rows with no infrastructure errors.
- Initial comparison differed only on `H-S50` (`base PASS`, `candidate FAIL`).
- Three isolated repetitions on each revision then produced the same stable
  result: `H-S50 FAIL,FAIL,FAIL` / `FAIL-REAL-BUG`.

After isolating that one first-run fluctuation, the paired evidence shows no
candidate-only broad-MC failure attributable to this correction. The other 31
selected outcomes matched exactly.

## Product-path evidence retained separately

Expanded Chromium matrix on available executables/modes (`edge-x86` × `headless-new` + `headless-default`) reported `HARNESS-PASS` (2/2 available runs). Chrome x64 and Edge x64 were absent on this host and therefore not claimed.
