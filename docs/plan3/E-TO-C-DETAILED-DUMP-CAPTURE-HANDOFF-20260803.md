# E to C: Detailed Dump Capture Handoff

Timestamp: 2026-08-03T19:28:00+01:00

## Verdict

`NO_LIVE_SOAK_BROWSER` is structural for a standalone E attach. The queue gives E the box by emptying it; an empty box has no soak browser to measure.

The trigger moves to C's sampler. E keeps the parser, gate, and artifact contract. C invokes the capture in-process at the four scheduled item-6 moments inside the soak run, using the same browser/session that owns the floor being explained.

## Exact Call

Replace or extend C's current `readArenaColumns(browser, totalPrivateMB)` path in `scripts/sealed-two-arm-soak.mjs`.

Current C call site:

```js
arenas = (await phases.run('sample.readArenaColumns', budget('sample.readArenaColumns'),
  () => readArenaColumns(session.browser, footprint?.footprintTotalMB ?? null), { fallback: {} })).value;
```

Detailed item-6 call to wire inside that bounded phase:

```js
import fs from 'node:fs';
import path from 'node:path';

import { arenaColumns } from './lib/arena-columns.mjs';
import { collectAllocatorDetail, pickHeaviestDetail } from './lib/blink-allocator-detail.mjs';

async function readDetailedArenaColumns(browser, totalPrivateMB = null, {
  moment,
  outDir,
  settleMs = 1500,
} = {}) {
  let browserCdp = null;
  try {
    browserCdp = await browser.target().createCDPSession();
    const byPid = await collectAllocatorDetail(browserCdp, { settleMs });
    const heaviest = pickHeaviestDetail(byPid);
    const row = {
      ...arenaColumns(heaviest?.detail?.rootsMB || null, { totalPrivateMB }),
      arenaDumpPid: heaviest?.pid ?? null,
      arenaDumpProcesses: byPid.size,
      detailState: heaviest ? 'DETAILED_ALLOCATOR_CHILD_ROWS' : 'DETAILED_ALLOCATOR_ROWS_ABSENT',
    };

    const artifact = {
      signature: 'DETAILED-DUMP-CAPTURE-V1',
      at: new Date().toISOString(),
      moment,
      totalPrivateMB,
      totalBasis: 'all-chrome-process-private',
      processes: [...byPid.entries()].map(([pid, allocatorDetail]) => ({
        pid,
        allocatorDetail,
      })),
      selectedPid: heaviest?.pid ?? null,
      row,
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, `${moment}.detailed-dump.json`), JSON.stringify(artifact, null, 2));
    return row;
  } catch (e) {
    return {
      ...arenaColumns(null, { totalPrivateMB }),
      arenaDumpPid: null,
      arenaDumpProcesses: 0,
      detailState: 'DETAILED_DUMP_CAPTURE_ERROR',
      arenaDumpError: String(e?.message || e).slice(0, 180),
    };
  } finally {
    try { if (browserCdp) await browserCdp.detach(); } catch (_) { /* session already gone */ }
  }
}
```

Keep it inside C's existing `phases.run(...)` bounded wrapper. Do not launch a second Node process and do not attach opportunistically from E.

The row returned by `readDetailedArenaColumns(...)` replaces the old root-only `readArenaColumns(...)` row for the scheduled item-6 moments. Outside those four moments, C may keep the cheap root-only sampler if runtime cost matters.

## What Must Be Open

- The same `session.browser` and `session.page` already owned by C's soak or canonical-floor sampler.
- A browser-level CDP session from `browser.target().createCDPSession()`.
- The footprint row for the same sample, because `totalPrivateMB` must be the same `footprintTotalMB` basis C already writes beside `ARENA-COLUMNS`.

Nothing else should be open. E should not own a browser, a queue claim, or a second attach process for item 6.

## Where It Writes

Write one raw detailed artifact per moment under C's run directory:

```text
<c-run-dir>/detailed-dumps/<moment>.detailed-dump.json
```

Then parse with E's parser:

```powershell
node scripts/detailed-dump-parser.mjs "<c-run-dir>/detailed-dumps/*.json" --out="<c-run-dir>/detailed-dumps/parsed.json"
```

If PowerShell wildcard expansion is not desired, pass the four files explicitly.

The parsed report must preserve `detailState`. `ROOTS_ONLY_FLATTENED_ARENA_COLUMNS` is still `NOT_QUOTABLE_COVERAGE`; only `DETAILED_ALLOCATOR_CHILD_ROWS` can advance item 6 toward COV-01.

## Pre-Fire Wiring Proof

No ten-hour fire should depend on this until C has run a smoke/rehearsal proof that writes and parses the four files. The proof gate is mechanical:

- Exactly four files exist under `<c-run-dir>/detailed-dumps/`, one for each moment below.
- `node scripts/detailed-dump-parser.mjs <four files> --out=<parsed report>` exits 0.
- The parsed report has `sampleCount === 4`.
- Every sample has `detailState === "DETAILED_ALLOCATOR_CHILD_ROWS"`.
- Every sample has non-null `coverage.coveragePct`, `coverage.totalPrivateMB`, and `coverage.totalBasis === "all-chrome-process-private"`.
- The parsed report has adjacent diffs for the sequence C declares. A missing diff is a wiring defect, not a memory result.

If any cell fails, report `DETAILED_DUMP_WIRING_ABSENT` or `DETAILED_DUMP_WIRING_ROOTS_ONLY`; do not convert a roots-only row into a pass.

## Four Moments

The four scheduled item-6 captures belong to C's sampler, not E's queue:

- `zerotrade:start`
- `zerotrade:end`
- `trades:start`
- `trades:end`

These are the two endpoints of each sealed soak arm. If C renames the moments in the sampler, keep the same meaning and put the mapping into the artifact. Do not add an opportunistic fifth capture taken after the queue clears; it samples the wrong browser state and is not comparable run to run.

## E-Owned Validation

E-owned parser/gate remains:

```powershell
npm run test:detailed-dump-capture
node scripts/detailed-dump-parser.mjs <four C artifacts> --out=<parsed report>
```

Current proof before this handoff:

- Parser gate: PASS 4/4 at 2026-08-03T18:55:00+01:00.
- C floor cross-check: `_evidence/manager-E/detailed-dump-parser-canonical-floor-pass3-20260803.json` independently reproduces `59.84% coverage / 271.05 MB unattributed` as `ROOTS_ONLY_FLATTENED_ARENA_COLUMNS`.
- Standalone attach proof: `_evidence/manager-E/detailed-dump-capture-20260803/2026-08-03T18-14-29-735Z/watch-report.json` records `NO_LIVE_SOAK_BROWSER`, which is why the trigger moved.
