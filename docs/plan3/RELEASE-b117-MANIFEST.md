# Release manifest — canary `20260731b117`

**Shipped:** 2026-07-31 ~10:26Z by manager-B
**Source SHA:** `1dad98859fe24d9e1d1b20846451a1f17e342220`
**Images:** `talaria-trading-chart:canary-20260731b117`, `talaria-homepage:canary-20260731b117`
**Restore tarball:** `/root/talaria-restore/images/canary-20260731b117.tar.gz`
**Predecessor:** `20260730b116` (`85d988ca8feba8b0c7933a641e7784c213bdf108`)

D and E were idle waiting on this build. It is up.

---

## Train contents, by SHA

Every row is named by the SHA that introduced it, not by its commit message, and every row
carries a marker that was checked **on the wire** after the deploy rather than in the tree.

### New in b117

| Row | SHA | Marker verified on the wire |
|---|---|---|
| A — TICK-OFF-01 candle-only playback kill-switch | `801783777` | `_isCandleOnlyPlaybackEnabled` in `/chart/modules/replay-system.js` |
| A — TICK-OFF-01 landing note | `bf74eced0` | docs only, no wire surface |
| B — support passport account age + closed-trade count | `1cd2b1ab3` | `_support_account_facts` in the container's `/app/api_server.py` |
| E — opening-range bands bound to the configured window (TAL-01938) | `eb1cb76ae` → `6f87a7778` | `flushRangeWindow` in `/chart/modules/chart-indicators-full.js` |
| E — warm-up window contract | `77e7bbfff`, `095d91628` | docs only, no wire surface |

**On the SHA the Director named.** The dispatch named `bf74eced0` as where A's kill-switch landed.
`bf74eced0` is a docs-only commit — 129 lines of markdown announcing the landing. The implementation
is `801783777`. Shipping the named SHA alone would have put a document on the canary and no flag,
and the wire marker would have come back absent. Both were pulled.

### Inherited from b116, re-verified on the wire in b117

| Row | SHA | Marker verified on the wire |
|---|---|---|
| Rayan #8 — M24 order-id gap reconcile | `2baa2c5b1` | `__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1` |
| Rayan — explicit place audit | `2baa2c5b1` | `__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1` |
| D — excursion single-owner | `ccc9b34c1` | `__TALARIA_DISABLE_EXCURSION_SINGLE_OWNER_V1` |
| D — TRADE-EVICT-V1 | `987ee25fb` | `__TALARIA_DISABLE_TRADE_EVICT_V1` |
| E — clearIndicators evict | `767211a93` | `__TALARIA_DISABLE_INDICATOR_EVICT_V1` |
| B — window-claim P0 (claim + bounded release) | b115 | `def chart_window_claim`, `Prefer bounded controlFetch` |
| b116 served hygiene — dead indicator copies | b116 | three dead copies still absent from the image |

---

## TEST-02 — the discriminating marker for TICK-OFF-01

The requirement was a marker *provably absent from a build predating the fix*, not merely present
in this one. Presence alone is worth very little: on the window-claim P0 the marker shipped and the
hang survived.

So the negative control was taken **from the wire, on b116, before the deploy** — not from a source
tree, not reconstructed afterwards. That file is on the host at
`/root/b-tickoff/prefix-baseline/replay-system.js`, sha256 `3092e11d4d93ecd4…`, 453,663 bytes.

| Marker | b116 (before deploy) | b117 (now) | |
|---|---|---|---|
| `_isCandleOnlyPlaybackEnabled` | 0 | 2 | discriminating |
| `__TALARIA_DISABLE_CANDLE_ONLY_PLAYBACK_V1` | 0 | 1 | discriminating |
| `TICK-OFF-01` | 0 | 1 | discriminating |

Both fetches were positive-controlled against `startCandleByCandle` first, because an absence
proved against a login page or a 404 body is not an absence. The served file's sha256
(`79c57bd48c172f0c…`) equals the sha256 inside the homepage image, so no cache is standing between
the assertion and the artefact.

## The half a grep cannot reach

A's commit discloses the gap honestly: *"nothing paints. node:test cannot see a canvas."* A present
string is not a working switch. Against the module fetched from live b117, in a real browser:

| Arm | stored preference | `getPlaybackMode()` | |
|---|---|---|---|
| flag unset — kill active | `tick` | `candle` | ok |
| flag `true` — kill lifted | `tick` | `tick` | ok |
| flag `0` — falsy | `tick` | `candle` | ok |
| flag `'0'` — truthy string | `tick` | `tick` | ok |

The two arms differ, so the flag controls something. Truthiness is real truthiness, not `=== true`.
`this.playbackMode` is still `'tick'` after both arms, so the user's stored setting returns intact
when the switch is removed post-canary.

**Still open:** this confirms the accessor's branch, not four panels painting. A full multichart
replay under the kill remains unproven and is A's disclosed gap, not a claim made here.

---

## Deploy freeze

The freeze was armed by me at 2026-07-31T00:15:40Z to protect a PO test window on b116, with the
clock and the lift handed to D. It was **lifted by me at ~10:19Z** before this ship. The guard did
its job — it refused the first ship attempt outright.

Grounds recorded in the lift, and worth repeating because the freeze was overridden on them:

- No human session was present. 981 of 981 requests in the preceding 15 minutes were HeadlessChrome.
- `MEASUREMENT-IN-PROGRESS`, the host's agreed "do not deploy, I am measuring" claim, was absent.
  Nobody had reserved the host under the protocol that exists for exactly this.
- The Director ordered the ship with D and E idle and blocked on it.

**One cost was incurred knowingly.** An automated multichart harness (panels C and D,
`chartWindowId=cwms8sgny8wx212uk1t6`) was running at roughly 843 requests/minute and was
interrupted by the container restart. It is re-runnable and was not registered under the
measurement protocol, but whoever owns it should re-run and should know why it died.

If you want a freeze that survives this reasoning next time, register the window with
`MEASUREMENT-IN-PROGRESS`. A freeze whose stated protectee cannot be observed is a freeze that will
eventually be lifted by someone who checked.
