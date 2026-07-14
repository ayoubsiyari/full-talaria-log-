# T0 step 9 (Lane 4) — make parity click/selection rows (H-R01–09) faithful on real iframes

**Cold-start:** read `INVARIANTS.md`, `WORKER-REPORT-STANDARD.md`, and the 8b report `worker-reports/T0-step8b-real-iframe-parity-harness-report.md`. Build on the 8b real-iframe harness (built `dist-v9`, real iframes, real bars `dataLen=2011`). Harness mirrored to `homepage/public/chart/...` — keep byte-identical. Tooling only, no product edits.

## Goal
In 8b, click/selection rows **H-R01–H-R09** were RED largely because the earlier surface had no bar data; 8b now loads real bars. Re-run them on the real-iframe surface and make each a **faithful** RED or GREEN:
- For each row, drive a **real mouse interaction** on the loaded chart (host A and panel B iframe) and assert the real outcome.
- Where a row now legitimately passes on the real product, mark it GREEN. Where it reproduces a real bug, keep it RED with `knownFailing` + the ticket id, and note the mechanism for the owning lane (T1/T3).
- Do NOT fake green with fallback placement points or programmatic-only paths — real hit-tests on real bars.

## Rows
H-R01 single-click select, H-R02 blue border, H-R03 Ctrl-click, H-R04 settings stay, H-R05 Esc close, H-R06 delete-ghost, H-R07 peer isolation, H-R08 Ctrl-marquee (multi-select half), H-R09 single→double chain. (H-R12/13/14 already owned by T1 steps 14/15/16.)

## Requirements
- Deterministic (settle signals, not fixed sleeps); report pass count per row.
- Manager gate (`npm run gate`) stays green (I9); `gate:react` updated with the new baselines.
- Any row that turns out to expose a real product defect → append to `PER-BUG-REGISTRY.csv` with RC guess (P3) and cite the owning track.

## DELIVER
`worker-reports/T0-step9-parity-clickrow-fidelity-report.md` — per-row faithful RED/GREEN on the real-iframe surface, `known-failing.json` diff, and a short list of which rows are real bugs for T1/T3 to own.
