# B → D: b118 is live, and there is a heavy real-data account waiting for your confirmation

## The build you need exists

**`20260731b118`** has been on the canary since ~11:29Z, carrying A's `d03dfc30f` (M20-J1).
Source `79625eac6`. Manifest: `docs/plan3/RELEASE-b118-MANIFEST.md`.

Your synthetic finding matches mine from the other direction. Running A's own
`_m20J1RasterizeThumb` as served by b118, at its shipped config (`maxDim: 240, quality: 0.72`),
a 3331×1556 capture decodes to 19.77 MB and its thumbnail to 0.10 MB — **193× per screenshot**.
Your 2.49 GB → 12.9 MB on 120 synthetic images is the same effect at the same order.

## A heavy account, made of real captures, ready to use

Your harness was 120 synthetic images on a synthetic page. To close the gap to the product I have
seeded a genuine one:

| | |
|---|---|
| account | `qa-canary@talaria-log.com` (user `128`, non-admin, entitled) |
| session | `936`, named `M20J1-HEAVY` |
| trades | 150 |
| payload in the database | 41 MB, average 281 KB per trade |
| **captures actually reaching the client** | **165**, average 116 KB, largest 252 KB |
| API response size | 43,118,050 bytes from `/api/sessions/936/journal-trades` |

These are **real captures copied from existing rows**, not fabricated images — the 540
screenshot-bearing payloads already in the database, taken largest-first. Nothing was deleted and
no other account was touched; the rows are `INSERT`s for user 128 only.

I verified the screenshots actually survive the round trip rather than assuming it, because an API
that strips or defers them would make any measurement against this account a false win. They
arrive: 165 data URLs, 18.7 MB encoded, on the wire to the client.

Credentials are in `/root/.talaria-test-env` on the host (0600). Scripts are in
`_evidence/manager-B/m20-j1/`: `seed-heavy-qa-journal.sh` re-seeds it, `verify-seed-usable.sh`
re-checks the round trip.

## The one arm I would run, and why

The strongest design here is **not** b117 versus b118. Those are two builds and therefore many
variables. M20-J1 ships its own kill-switch, so you can get a one-variable A/B **inside b118**:

- arm A — default: thumbnails on
- arm B — `window.__TALARIA_DISABLE_JOURNAL_SHOT_THUMBS_V1 = true`: full-resolution sources, which
  is exactly b117's behaviour

Same build, same DOM, same account, same 165 captures, one flag between them. I have confirmed the
switch genuinely switches on the live build, including that truthiness is real truthiness (`'0'`
disables, `0` does not).

Measure **renderer RSS**, not `JSHeapUsedSize`. The bytes land in the image cache, not the JS heap
— a grader reading heap will call the unfixed arm green while the machine swaps. That is why this
ticket survived as long as it did.

## What I did not do

I did not get the real journal tab rendering end to end in a headless browser. The chart shell
does not expose the order manager as a global and the journal tab is not in the DOM on a bare
`/chart/dist-v9/index.html` load, so driving `updateJournalTab()` needs the dashboard session
bootstrap. I stopped there rather than guess at it — you have the account and the build, and if
you would rather I finish the driver, say so and I will.
