# B1 — what four panels on four symbols actually ask the server for

**Owner:** Manager B
**Authority:** `DISPATCH-CONF01-20260730-1430.md` §MANAGER B, item B1; `CONF-01` binding
**Instrument:** `chart v 1.4/chart/multichart-prod/harness/` (extended, see §6), probe
`.scratch-b1-conf01-network.mjs`, fidelity check `.scratch-b1-fidelity.mjs`
**Raw:** `.scratch-b1-conf01.json`, `.scratch-b1-same.json`

---

## 1. The answer in one paragraph

Under CONF-01 the extra network cost is **at boot, not during play**, and it is a **latency**
cost far more than a bytes cost. Four panels on four symbols issue 8 data requests totalling
1.22 MB against same-pair's 5 requests and 760 KB — but boot wall time goes from 1.6 s to
10.1 s, and panel time-to-first-paint from ~1.2 s to ~9.5 s. During thirty seconds of playback
**both** configurations issue **zero** data requests. Requests are neither coalesced nor
deduplicated across panels, and they are effectively **serialised** — never more than two in
flight — because panels are constructed one after another. They do **not** queue behind the
window claim: panel realms are exempt from claiming.

---

## 2. Configuration actually achieved

`CONF-01` asks for four panels, four symbols, four timeframes, indicators loaded. Verified in
the running browser rather than assumed:

| panel | file | symbol | timeframe | `_multichartSamePairAsHost()` | aliased to host | own `_panelFullRawData` |
|---|---|---|---|---|---|---|
| A (host, in-process) | 25 | EURUSD | 1m | n/a | n/a | — |
| B | 27 | GBPUSD | 5m | **false** | false | 2000 bars |
| C | 28 | DEEPFX | 15m | **false** | false | 2000 bars |
| D | 29 | USDJPY | 1h | **false** | false | 2000 bars |

The ruling's mechanism is confirmed directly: with differing symbols every guard returns
false, nothing is aliased, and each panel carries its own base series. In the same-pair
control the same panels report `samePairAsHost` true 341–363 times and hold **no**
`_panelFullRawData` at all.

---

## 3. The measurement

Both arms driven identically, playback stepped exactly as scenario `H-S8` steps it (the
scenario that asserts "data fetches during play == 0"), so configuration is the only variable.

### Boot — cold acquisition

| | same-pair (historical) | CONF-01 (shipping) | ratio |
|---|---|---|---|
| data requests | 5 | 8 | 1.6x |
| bytes | 760,172 | 1,221,849 | 1.6x |
| **boot wall time** | **1,638 ms** | **10,067 ms** | **6.1x** |
| max requests in flight | 2 | 2 | — |
| distinct symbols fetched | 1 | 4 | 4x |

### Time to first paint, per panel

| panel | same-pair | CONF-01 | ratio |
|---|---|---|---|
| A (host) | 463 ms | 704 ms | 1.5x |
| B | 1,192 ms | 9,390 ms | 7.9x |
| C | 1,192 ms | 9,901 ms | 8.3x |
| D | 1,371 ms | 9,445 ms | 6.9x |

Panels B/C/D do not even *begin* their request until 9.29 s, 9.39 s and 9.80 s. The wait is
panel construction and independent load-and-resample, not transfer: each request itself
completes in 10–90 ms.

### Play — thirty seconds, both inside and past the loaded master

| | same-pair | CONF-01 |
|---|---|---|
| requests while playing inside the loaded master | 0 | 0 |
| requests while playing **past** the loaded master | 0 | 0 |
| claim-family requests during play | 0 | 0 |

---

## 4. Coalesced, deduplicated, or serialised — answered separately

**Coalesced: no.** There is no batching endpoint. Each panel issues its own
`/api/file/{id}/bars`. Nothing merges four panels' needs into one request.

**Deduplicated: per-realm only, and moot across panels.** `ViewportDataManager` keeps a
`pendingRequests` map keyed on `JSON.stringify(params)` and returns the in-flight promise on a
repeat (`modules/viewport-data-manager.js:224-228`, `:210`). That map is per instance, and each
panel is its own realm, so it never dedupes *across* panels. With four different symbols the
`fileId` differs anyway, so there is nothing to dedupe — the requests are genuinely distinct.
Measured: 8 requests, 8 distinct URLs, 0 repeats.

**Serialised: yes, in effect.** Never more than two data requests in flight in either arm,
because panels are constructed sequentially. This matters beyond B1: it means four
simultaneous large responses — the premise of B3 — does not occur.

**Queued behind the window claim: no.** `chart-window-limit.js` gates `/api/file/*` and
`/api/sessions/{n}/state`, so a panel's bars request *is* a gated URL. But a panel realm is
detected as a multichart panel, `shouldClaim()` is false, and `ensureClaimed()` resolves
immediately without a claim. Only the host claims. Measured: zero claim-family requests during
play, and panel data requests never wait on one.

This is worth stating precisely because it bounds the P0: the claim hang could never
*serialise* panel data requests. What it did was hold sockets open, and HTTP/1.1 caps
connections per origin per browser, so it starved the pool browser-wide. Different mechanism,
same user-visible symptom. That is fixed in b113 and re-confirmed today (18/18).

---

## 5. Why play issues nothing, and the limit of that claim

Zero requests during play is not coalescing. It is an early return, and it fires even when the
playhead is past the data.

`ensureReplayDataCoversTimestamp` (`chart.js:7930-8040`) is called **90 times per panel** during
the play phases. Every call returns `true` at the *first* exit: `_panelFullRawData` exists and
`_independentMasterCoversReplayTimestamp(ts)` reports the master covers the timestamp. The
independent-pair catch-up fetches below it — `_fetchIndependentReplayBridge` and
`_fetchReplaySeekBuffer` — were called **zero** times.

They report coverage while the playhead is past the last master bar. Walking the playhead
~5 hours beyond `masterLastT`:

```
B: playhead 1785431580000  masterLastT 1785420300000  pastMaster=true   covers=true
C: playhead 1785431580000  masterLastT 1785419100000  pastMaster=true   covers=true
D: playhead 1785431580000  masterLastT 1785416400000  pastMaster=true   covers=true
```

Bar counts do not change (2000 before, 2000 after). So the panel neither fetches nor advances
its data — it reports coverage it does not have. **Flagged to A and D rather than fixed here:
this is replay data coverage, not the network path, and it is a correctness question about
what those panels paint.**

**Stated limit of the zero-fetch claim.** The harness has no `backtestingSession`, and
`ensureReplayDataCoversTimestamp` returns false without one (`chart.js:7963`). That exit is
*downstream* of the coverage exit that actually fired, so it did not cause the zero — but it
does mean this measurement cannot prove a production session with a real backtest session
would also fetch nothing once the coverage check is corrected. The zero is a real observation
of the current code path, not a guarantee about the corrected one.

---

## 6. Instrument changes, so C can reuse rather than rebuild

The harness could not express CONF-01 before today. Its most-distinct mode was
`pair=multi-independent` — three symbols with tile D duplicating the host — and one timeframe
for all four panels. Every four-panel measurement in this campaign was taken through it.

Added, harness only, no product code:

- `serve.mjs` — fourth instrument, file `29` (`USDJPY`), so four distinct symbols exist at all.
- `serve.mjs` — `pair=conf01`: A=25, B=27, C=28, D=29, every panel on its own instrument.
- `serve.mjs` — `tfs=1m,5m,15m,1h` for per-panel timeframes. Absent entries fall back to the
  existing single `tf`, so every pre-existing scenario is untouched.
- `serve.mjs` — the API log records response **bytes** and status per request, attached to the
  response object so it stays correct when two panels are served at once.
- `harness-lib.mjs` — `bootLayout` forwards `tfs`.

`countFetchesByFile` / `totalDataFetches` already existed and now have bytes alongside.

---

## 7. What this does and does not support

**Supports.** The shipping configuration is materially worse at boot: 6x wall time, 7–8x panel
time-to-first-paint. On a canary that is the difference between a chart that appears and one a
user believes is broken. It is on the critical path of every multichart page load.

**Does not support.** The ruling's expectation that panels "issue their own `/bars` requests
while playing" — measured zero, in both arms, including past the loaded master. The
per-panel cost during play is residency and CPU, which is A's lane, not requests.

**Bytes are a floor, not production values.** The harness caps `/bars` at 2000 bars per
response, where production `/smart` accepts `limit` up to 100,000. Request counts, staggering
and concurrency carry over; absolute byte totals do not.

**Same-pair keeps no acceptance weight.** It appears here only as the contrast that quantifies
what the sixteen guards were buying.

---

## 8. CKPT-01 on the one landing this produced

The nginx session-state body buffer (§B3 in the journal, `client_body_buffer_size 1m` on
`location ^~ /api/sessions`) is a live-wire change, so it gets the full checkpoint. Tag
`ckpt/pre-nginx-sessionstate-buffer-20260730b113`.

**1. Annotated tag on the exact tip, read from the running page.** Build id `20260730b113` from
`__TALARIA_CHART_BUILD_ID`; commit `be7bc73a6be16e143adddc8efa0bba40d7c14e64` from
`org.opencontainers.image.revision` on **both** running images, not from my own branch state.

**2. Retained deployable artifact.** `talaria-trading-chart:canary-20260730b113` and
`talaria-homepage:canary-20260730b113` are on the host — the bytes that actually ran — so
rollback is a redeploy, never a rebuild. b112 is retained as well. Config backups at
`/root/talaria-restore/nginx.local.conf.bak-ckpt-*`.

**3. Kill-switch.** `canary-nginx-sessionstate-buffer-switch.sh {on|off|status}`, repo copy at
`deploy/canary-nginx-sessionstate-buffer-switch.sh`. nginx has no runtime flag for a body
buffer, so the switch is the marked config region. Both directions are surgical: it adds and
removes only the text between its own markers. The gate has cells for the markers, including
one that goes RED if the directive is moved outside them — a rollback that silently does
nothing is worse than no switch.

**4. Rollback exercised, with a differential rather than an assertion.** Three ~538 KB
`PATCH /api/sessions/930/state` per arm, counting `a client request body is buffered to a
temporary file` in the live error log:

| arm | new temp-file writes | shell | /api/sessions | /api/file |
|---|---|---|---|---|
| switch ON (the landing) | **0** | 200 | 401 | 401 |
| switch OFF (rollback run) | **3** | 200 | 401 | 401 |
| switch back ON | **0** | 200 | 401 | 401 |

Three requests produced exactly three temp-file writes with the switch off and none with it on,
so `FLAG-01` is satisfied against the absent property rather than against a log line saying the
feature is inactive. The OFF arm keeps the product working — shell 200, routes 401 because auth
is enforced, not 502 — which is `FLAG-03`. Stamp `20260730b113` unchanged in every arm and the
container was never recreated, so the flip needs a reload and nothing more.

### The cross-switch hazard this uncovered

`canary-nginx-bigjson-switch.sh` restored a **whole-file** pristine copy on `on`, taken
29 July. Flipping it today would have silently reverted this landing: exactly the PURGE-2
failure mode named in `AMENDMENT-DIRECTOR-RUNS-THE-MILES-20260730-1445` §3, a kill-switch that
reverts a fix nobody knew had shipped. Its `on` path now reinserts only its own marked region,
with a loud warning on the legacy fallback path. Exercised: bigjson `off` → `on` with the
session-state buffer verified still live on both sides, and the tile cache confirmed intact
(the first check read `0` because the grep used one space against a multi-space directive — a
false alarm, re-checked with a proper pattern).

### Ordering, stated plainly

The config landed at 14:29, before this checkpoint existed. Tag, switch and exercised rollback
were retro-fitted at 15:00 once `CKPT-01` was issued. The landing is now protected by a proven
switch, but the order was wrong and the record says so.
