# FINDING — four answers with no new run: workers are a fixed pair, logout discards the realm, and nothing pins a stale shell

**2026-07-31 10:55** · Manager C · tier=mid model=claude-opus-5-thinking-high
**Ruling** cbfdb81f4 items 5 and 7 · **Rules applied** `UNIT-01`, `KILL-02`
**Cost** zero machine time. Three answers from source, one from S3 samples already on disk.

## Verdict first

| question | answer | source |
|---|---|---|
| Are workers spawned per recalculation and never terminated? | **No. A fixed pool of exactly 2, only when indicators exist.** | S3 samples on disk |
| Does logout reload, or is it same-document navigation that never discards the realm? | **It reloads. Cross-document navigation to `/login/`.** | `talaria-v9-live.js` |
| Is a service worker pinning a stale shell? | **No. The SW caches nothing and deletes all caches on activate.** | `chart/sw.js` |
| Are inline source maps a free win? | Already dead per the Director at 09:10 — **not re-tested.** | ruling Delta 4 |

## Item 5, second half — the worker hypothesis is dead

The concern was "14,709 recalcs with a worker per batch and no termination would be invisible to
everything you ran". My S3 sweep sampled worker counts every ~10 seconds through 36 minutes of
playback at three indicator doses. Those samples were already on disk:

| indicators per chart | samples | workers first | last | min | max | types |
|---|---|---|---|---|---|---|
| 0 | 72 | 0 | 0 | **0** | **0** | — |
| 1 | 71 | 2 | 2 | **2** | **2** | `worker` |
| 2 | 67 | 2 | 2 | **2** | **2** | `worker` |

Three things follow. Workers exist **only** when indicators are loaded — zero indicators, zero
workers, which also makes the zero-indicator arm a clean negative control for anything worker-shaped.
The count is **pinned at exactly 2** through twelve minutes and many thousands of recalculations, so
nothing accumulates per batch. And **the count does not scale with indicator count** — one indicator
and two indicators both produce 2 — so it is a fixed pool created once, not per-indicator and not
per-recalc.

**What this does not close, stated precisely:** a worker created and *promptly terminated* within a
10-second sampling gap would be invisible here. But that variant is harmless by construction, because
the hypothesis under test was specifically non-termination. The accumulating version is dead; the
self-cleaning version costs nothing.

## Item 5, first half — the harness gap was real and is now closed

The Director's guess was correct. `sweep-gauges.mjs` never called
`measureUserAgentSpecificMemory()`, so **worker heaps were excluded from every memory figure it
produced**. A worker heap lives in its own V8 isolate; neither `usedJSHeapSize` nor
`Performance.getMetrics` on the page can see a byte of it.

It is not a one-line change, because that API requires cross-origin isolation (COOP/COEP) which this
server does not send. It is now **attempted, with its availability and reason recorded rather than
assumed** — and the route that works regardless is the primary one: attach a CDP session to each
worker target and ask that isolate for `Runtime.getHeapUsage`.

**I am not quoting a worker-heap number yet.** Per `GATE-01` the gauge is queued to prove itself
against a 120 MB ballast allocated inside a real worker first — it must move by the ballast while the
page heap does not. A gauge that has not been shown to see a known quantity cannot be trusted to
report an unknown one. That validation also puts a number on how large the blind spot was.

Also added, for item 6's "GPU and canvas surfaces" row: a canvas backing-store census at 4 bytes per
device pixel, per frame, labelled a **FLOOR** because it excludes compositor double-buffering and
layer tiles. It deliberately does **not** call `getContext()` — on a canvas that has no context yet,
asking for one allocates a backing store, so the probe would inflate the number it is measuring.

## Item 7, X1 — logout does reload

```js
onClick: async () => {
  try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }) } catch {}
  const L = `${window.location.pathname || "/dashboard/"}${window.location.search || ""}`;
  window.location.href = `/login/?next=${encodeURIComponent(L)}`
}
```

Setting `location.href` to a different path is a **cross-document navigation**: the Document is
destroyed and the realm goes with it. The hypothesis that logout is same-document navigation which
never discards the realm is **dead**.

**The follow-on question is the one that matters and it is not answerable from source.** Discarding a
realm is not the same as returning the memory — Chrome may keep the renderer process and its allocator
arenas warm. So a user can log out, legitimately destroy the document, and still be sitting on the old
footprint. `SESSION-RESET-V1` is queued to measure exactly that: footprint reclaimed on logout, plus
storage bytes and first-paint cost across three successive sessions in one profile.

## Item 7, service worker — dead, and it took ten seconds

```js
const SW_VERSION = "talaria-chart-20260727b80";
self.addEventListener("activate", (event) => { /* deletes every cache, then claims clients */ });
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));   // straight to network, nothing cached
});
```

It precaches nothing, its fetch handler is a pass-through to the network, and on activate it **deletes
every cache it can see**. It exists to enable install-to-desktop. **Nothing pins a stale shell.**
Recorded per `KILL-02` so nobody spends an hour on it.

### One latent trap found while looking, for A or B

`SW_VERSION` reads `20260727b80` while the deployed build is **b116**. It is inert today because the
version-reload prompt that consumes it is retired and default-OFF. But `talaria-version-reload.js`
documents that `bump-dist-v9-cache.mjs` keeps the two "in lockstep", and they are plainly not in
lockstep any more. **If anyone re-enables that prompt, it will fire permanently on every load**,
because the staleness detector compares the page's build id against this stale constant. Cheap to fix
now, embarrassing to discover during a canary.

Its header comments also describe a caching SW with a navigation fallback serving stale `index.html`.
That describes a b94-era field failure, not the file that ships today — worth correcting so the next
person to read it does not re-open a dead suspect.

## For the Director

Items 5 and 7 are answered except for the two parts that genuinely need a machine, and both are queued
behind S5 in a serial queue that supersedes S2 and S4. **S2 and S4 are dropped**: both are slope work
and both rank below every item in the 09:15 queue. **S1 and S5 are kept** because they are not slope
work under the new priority — S1 *is* item 1's curve, and S5 *is* item 8's baseline half, varying total
loaded bars at a fixed visible window with no playback at all.

One item is blocked and it is one line: **item 4 needs a second account and I hold one set of
credentials.** I am not idling on it — I will measure the *mechanism* instead, whether account-scoped
history hydrates unbounded at load, which is decidable on a single account and is the part A would need
in order to cut. The cohort magnitude question still needs a genuinely heavy account from whoever owns
them.
