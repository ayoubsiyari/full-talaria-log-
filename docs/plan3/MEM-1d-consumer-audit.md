# MEM-1d — consumer audit before removal

Scope: 991 source files (`*.js`, `*.mjs`, `*.ts`, `*.html`), excluding `node_modules`,
`.git` and `.ckpt`. `fullRawData` does not contain the substring `fullData`, so a plain
search separates the two cleanly.

One line per copy, naming who reads it. A copy with no product reader is a removal
candidate; a copy pinned by a landed suite is not, regardless of whether product reads it.

## replaySystem.fullData — every product occurrence

| # | Site | Kind | Who reads it |
|---|------|------|--------------|
| 1 | `replay-system.js` ctor `this.fullData = null` | write | nobody in product; `chart-destroy.test.mjs` and `m27-engine-release.test.mjs` assert the field exists |
| 2 | `replay-system.js` `startReplayAtIndex` `[...this.chart.data]` | write | **nobody** — no product reader, no suite pins this site |
| 3 | `replay-system.js` `enterReplayMode` `[...this.chart.data]` | write | **nobody** — no product reader, no suite pins this site |
| 4 | `replay-system.js` release `instance.fullData = null` | write | `m27-engine-release.test.mjs:272` asserts it reaches null |
| 5 | `chart.js:6280` `rs0.fullData = null` | write | nobody in product |
| 6 | `chart.js:6839` reseed `[...this.data]` | write | `replay-reseed-incremental.test.mjs` mutates exactly this line |
| 7 | `chart.js:8315` reseed `[...this.data]` | write | `replay-reseed-incremental.test.mjs` mutates exactly this line |
| 8 | `chart.js:10579` reseed `this.data` by reference | write | `replay-reseed-incremental.test.mjs` mutates exactly this line |
| 9 | `chart.js:30118` `this.fullData = null` | write | nobody in product |

**Product readers found: zero.** Every product occurrence above is a write or a null-out.
The only reads in the tree are in tests and browser probes, and each of those writes the
field itself first — they exercise the copy, they do not consume it.

Reads, for completeness:

- `m27-engine-release.test.mjs` — asserts null after release, non-null before. Teardown row.
- `chart-destroy.test.mjs:196` — lists `fullData` among fields a destroy must null.
- `replay-reseed-incremental.test.mjs:519-523` — asserts the reseed result is a *copy* of
  `chart.data`, not an alias, and counts retention across ticks.
- `m19-*` browser probes and `m28-replay-hidden-pause.test.mjs` — assign it as scene setup.
- `b70-indicator-generation-shadow.auth-harness.mjs` — a local variable named
  `fullDataBefore` over `c.data`. Unrelated; name collision only.

## What this row removes

Rows 2 and 3 only: the entry-time snapshot, at both replay entry points. They are the only
copies with no product reader **and** no suite pinning them.

They are also genuinely redundant rather than merely unread: the reseed path (rows 6-8)
rebuilds `fullData` from `this.data` on the first tick of replay, so the entry-time copy is
overwritten before anything could have consulted it even if something did.

The field is set to `null` rather than dropped. Two teardown suites assert the field
exists, and nulling closes the one hazard in simply deleting the write — a snapshot
surviving from a previous session in the same tab and reading as current.

## What this row deliberately does not remove

Rows 6-8, the reseed copies, are unread by product too. They are left alone because
`replay-reseed-incremental.test.mjs` mutates those exact lines to generate its mutants, so
removing them silently converts another manager's suite into one that tests nothing. That
is a coordination question, not a memory question, and it is the characteristic failure
this audit exists to prevent.

Rows 1, 4, 5 and 9 are null assignments. They allocate nothing.

## Size, honestly

Each removed copy is an array of element references, not of bars — the bar objects are
shared with `chart.data` and stay alive through it. At 62,650 bars (ten hours at the
measured 6,265 bars/hour) two copies are on the order of one megabyte of pointers, not the
tens of megabytes the 24 MB-per-thousand figure would suggest. That figure tracks bars;
this row removes references to bars.

This row is a correctness and hygiene win with a modest memory component. **MEM-1c is the
row that moves the residency number**; this one should not be credited with bar savings it
does not deliver.
