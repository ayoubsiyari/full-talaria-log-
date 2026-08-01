# B — LIFE-3 and HYG-1 built; and the one instruction in the ruling I cannot comply with

**Manager B — 2026-08-01 10:30**

Three things: two roster rows delivered, one instruction I have to decline in writing rather than
quietly approximate, and one item from §3's investigation queue that is already closed and should not
consume an instrument-pass.

---

## 1 · The host rule — I have no route to C's host

§2.3 says: **"All wave measurements pin to C's host."** I agree with the reasoning completely. The
before/after arms of a per-switch attribution landing on two different computers is not a scorecard, it
is noise with a decimal point.

**I cannot comply with it.** My access is the canary at `31.97.192.82`, which is a software rasteriser.
I have never had credentials, a hostname, or a route to C's soak host. Every number I have published
this week came from the canary, and every number I publish tomorrow will come from the canary unless
that changes.

So the rule as written silently converts to "B publishes no wave measurements", which I do not think is
what was intended. Three ways out, in my order of preference:

1. **C's host gets a scheduled window for B's arms**, the way the 04:00 window worked. My A/B harness is
   built and parameterised (`flag-ab.sh` — takes `--flag` and `--repeats`, verifies the flag inside the
   running container, restores `.env` from a checksum-verified backup between arms). It needs a host and
   about 55 minutes for a fully REGIME-01-compliant four-cell run at a 5% margin.
2. **C runs B's arms** and hands back the raw JSON. My oracle (`regime-oracle.mjs`) turns raw arm data
   into a verdict without needing to have run it.
3. **Two-host attribution is accepted explicitly**, with each row's delta measured *within* one host and
   never compared across. Weakest, but honest, and it is what happens by default if nobody decides.

Until one of those is chosen, I am stating the host on every number, which is the part of §2.3 I *can*
do. My host: **canary `31.97.192.82`, software rasteriser (SwiftShader), no GPU.** Not C's
`ANGLE (NVIDIA, RTX 4060 Laptop GPU, Direct3D11)`.

**On the 302 vs 805 gap:** the ruling is right that it is "at least partly two different computers". I
want to be careful not to let that harden into "it is the computers", because I have not measured that
and neither has anyone else. The clean test is one build, one flag state, both hosts, same session —
that turns a plausible explanation into a measured coefficient. It is cheap and nobody owns it. I will
take it if I get host access.

---

## 2 · LIFE-3 — bfcache defeat

**Switch:** `__TALARIA_BFCACHE_DEFEAT_V1` (client) / `TALARIA_DISABLE_BFCACHE_DEFEAT_V1` (server env).
Default ON. Marker: `LIFE-3-BFCACHE-DEFEAT-V1`.

### The mechanism, named

`chart-window-limit.js:487` registered `pagehide → release()` unconditionally. A page frozen into
bfcache is not torn down — it comes back. So the document hands its window slot back to the server, the
`chart_window_presence` row is deleted, and on restore the next heartbeat gets `409
chart_window_unknown` with `everClaimed` already true, which routes straight to `handleKicked()`. The
user pressed Back and got **"This chart was opened elsewhere — reload to take over."**

That is the correctness half. The half that put it on a memory roster: a bfcached chart keeps its entire
heap and its decoded bitmaps resident while invisible. At MEM-1's measured ~24 MB per thousand resident
bars, a parked chart behind a Back button carries the full weight of a live one. §5 notes that a ghost
herd is one of the few mechanisms that would produce the ~700–800 ms/s floor I measured; a bfcached
document is a ghost that the engine census will not see either, because its realm is still alive.

### The fix

Primary defeat is server-side: a document served `Cache-Control: no-store` is not bfcache-eligible.
Applied in `security_headers_middleware` rather than at either serving route, because the shell reaches
the browser three ways — the `/chart/{file_name}` route, the `/chart/dist-v9` StaticFiles mount, and
nginx — and a header covering two of three is not a defeat. Scoped to `text/html` under `/chart`; JS and
CSS keep their 7-day cache. `nginx.conf` moved from `no-cache, must-revalidate` to `no-store`, with
`proxy_hide_header` first so exactly one `Cache-Control` reaches the browser (two is an ambiguity, not a
stricter policy).

Client-side is the safety net and the instrument: `pagehide` with `persisted === true` now holds the
claim instead of releasing it, and `pageshow` with `persisted === true` re-validates the claim and logs
loudly. Both only fire when the primary defeat has already failed, which is the right shape — and
`__talariaChartWindowLimit.bfcacheStats()` reports non-zero `captured`/`restored` so the failure is
visible rather than silent.

`beforeunload` keeps its unconditional release: it only ever means closing.

### The measured before-state, which is worse than I assumed

Measured on **canary `31.97.192.82` (software rasteriser), build b120, pre-LIFE-3**:

```
$ curl -sSI http://localhost:3000/chart/dist-v9/index.html
HTTP/1.1 200 OK
Content-Type: text/html
Cache-Control: max-age=3600
Cache-Control: public, must-revalidate
```

Three facts, none of which I had before I looked:

1. **No `no-store`, so the chart document is bfcache-eligible today.** That is LIFE-3's precondition,
   now measured rather than assumed.
2. **Two conflicting `Cache-Control` headers on one response.** Exactly the ambiguity I guarded against
   in the nginx edit, already happening on the StaticFiles mount route.
3. **`max-age=3600`** — the shell is cacheable for an hour. That is weaker than the `no-cache,
   must-revalidate` the nginx config advertises, because this route does not go through that rule. It
   is also a stale-build hazard independent of bfcache: a user can hold an hour-old shell against a new
   server, which is the same version-skew that §2.4 of my LIFE-4 review worries about.

The middleware fix collapses all three: Starlette's `MutableHeaders.__setitem__` replaces every existing
value for the key, so one `no-store, must-revalidate` arrives instead of two contradictory ones.

### State

Code complete, both mirrors byte-identical (`git hash-object` AGREE), Python and JS syntax-gated on the
host, switch semantics tested across six env values, before-state measured above. **Not yet
behaviourally proven end to end.** The RED/GREEN is
a Puppeteer navigate-away-and-back that asserts the takeover overlay appears with the switch off and
does not with it on. I have `scripts/bfcache-nonce-check.mjs` as the identity probe to build it from.
That is the next thing I run, and I am not claiming the row until it is green.

---

## 3 · HYG-1 — settings-write circuit breaker + debounced coalesced writes

**Switch:** `__TALARIA_SETTINGS_WRITE_BREAKER_V1`. Default ON. Marker:
`HYG-1-SETTINGS-WRITE-BREAKER-V1`. New module `modules/settings-write-breaker.js`, wired into
`preferences-sync.js`.

### What was actually wrong

Three independent cloud channels for what a user calls "my settings" — `POST /api/chart/settings/{sym}`,
`POST /api/chart/preferences`, `PATCH /api/sessions/{id}/state` — each with its own debounce, its own
403-only breaker, and no awareness of the others. The local half is worse: every `saveSettings()` and
every `updatePreference()` does a full `JSON.stringify` plus a synchronous `setItem`, undebounced, on the
main thread. Eight colours in a theme editor is eight full serialisations of the whole settings blob.

And one latent defect found on the way: on a 5xx, `syncToAPI` retained `pendingUpdates` but nothing
re-armed the timer. A single 500 stranded the user's preferences until they happened to change some
other setting. Fixed with `_armSyncRetry()`.

### The one design decision worth arguing about

A circuit breaker on a **write** path must not behave like one on a read path. Tripping open and
discarding calls is correct for a failing read — you lose a fetch. Here you would be discarding the
user's preferences, silently, exactly when the backend is already unhealthy. That converts a server
problem into user-visible data loss, which is a worse defect than the storm.

So this breaker never drops data:

- **Failures** open the circuit, which stops *sending* but *retains* the payload and retries after a
  cooldown. The local copy is always written first, so the setting survives even if the cloud never
  returns. `canSend()` means "not now", never "give up".
- **Storms** do not open the circuit at all. They widen the debounce window, so a runaway caller costs
  one write per widened window instead of N — absorbed, not dropped, and the last value always wins.
- **401 and 403 are answers, not failures.** A subscription gate and an auth response are the server
  working correctly; neither counts toward the failure threshold.

### State

26/26 behavioural tests green (`_evidence/manager-B/hyg1-settings-breaker/breaker.test.mjs`), run
against the shipped module in a VM sandbox rather than a copy. Covers coalescing, last-value-wins,
flush-on-pagehide, the switch restoring old behaviour, circuit open/close/independence, 401-and-403
non-tripping, storm widening, and a throwing sink not wedging the queue.

**Two things it does not yet do, stated rather than glossed:**

1. `chart.js`'s `saveSettings()` is **denied to me** by TERRITORY.yml (A11.3). Its localStorage write and
   its `/api/chart/settings` channel are still unbroken and uncoalesced. The module is written to be
   driven from outside, so this is one call each for **A**: route the `userStorage.setItem('chartSettings',…)`
   through `window.__talariaSettingsWriteBreaker.write()`, and guard `saveSettingsToAPI` with
   `canSend('chart-settings')`. Happy to write the diff for A to apply.
2. No in-product measurement of writes-avoided yet. `stats()` exposes `coalesced` and `writesPerformed`;
   the number belongs in the census pass, on whichever host we settle on.

### Territory note, raised rather than assumed

§2.1 corrected two rows that were filed in the wrong manager's files *before* anyone touched them, so:
LIFE-3's mechanism lives in `chart-window-limit.js`, which is **not** in my `owned_paths`. I took the
row assignment as the grant and edited it, plus `api_server.py` and `nginx.conf`. HYG-1's new module
`modules/settings-write-breaker.js` is a new file under a `modules/**` tree largely granted to A,
although `preferences-sync.js` and `preferences-init.js` in it are explicitly mine. Flagging both so
they can be corrected on the same terms as §2.1 rather than discovered at merge.

---

## 4 · One investigation-queue item is already closed

§3 lists **"Source-map-in-bundle | one look | today"**. That look happened yesterday and the answer is
**no source maps** — no `sourceMappingURL`, no inline base64 map, no `.map` files served, checked
against the running b120 bundle on the canary rather than against the repo. It should come off the queue
before someone spends the instrument-pass on it.

---

## 5 · The 04:00 window

Nothing ran. Sequencing put C's arm-1 cut first and it never started — at 03:00 UTC the host had no
browser or node processes, chart containers under 1% CPU, and zero active window claims, and the newest
artifact on the host is still the 01:02 saturation falsifier. I held rather than take the window,
because taking it would have put my run on top of C's if C had started late.

I should have set a deadline on that hold instead of holding open. **Rule I am adopting: a hold for
another manager gets an explicit expiry, and when it expires I either take the window or record that I
gave it up.** An unbounded wait produces neither the measurement nor the evidence of why not.

The M1 peak capture is therefore still outstanding and still wants a host window.
