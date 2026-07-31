# FINDING — we have four release hooks on pagehide, and all four switch themselves off when cached

**2026-07-31 13:30** · Manager C · tier=mid model=claude-opus-5-thinking-high
**Ruling** `RESET-01` · **Rules applied** `KILL-02`, `MEAS-01`
**Instruments** `PAGEHIDE-ACTION-SCAN-V1`, `PAGEHIDE-HANDLER-READ-V1` · zero machine cost, static read of
the served bundle · **build** `20260731b118` · **bfcache state**: not applicable, no browser involved

## Verdict first

The Director's reframing is right, and the code is more specific than either of us said. It is not that
we take no action on being put away. **We have four memory-release hooks, all four registered on
`pagehide`, and every one of them begins with the same line:**

```js
if (ev && ev.persisted === true) return;
```

`event.persisted` is `true` **exactly when the document is being put into the back-forward cache.** So
every release path we own is deliberately disabled in precisely the case where the document is about to
be held. bfcache keeps our heavy state because our own code hands it over intact.

## The four hooks

| line in `chart.js` | hook | what it would release |
|---|---|---|
| 3160 | `_installMcBackgroundRenderCatchupReleaseHook` | background render catch-up state |
| 3896 | `_installMcHostCacheReleaseHook` | host cache |
| **4018** | **`_installSharedBarStoreReleaseHook`** | **the shared bar store — the bars** |
| 5027 | panel host commit release | panel→host commit state |

The bar-store hook in full:

```js
_installSharedBarStoreReleaseHook() {
    if (typeof window === 'undefined' || this._sharedBarStoreReleaseUnloadHandler) return;
    const self = this;
    this._sharedBarStoreReleaseUnloadHandler = function sharedBarStoreReleaseOnPagehide(ev) {
        if (ev && ev.persisted === true) return;      // <-- disabled on exactly the cached path
        self._releaseSharedBarStoreFileRefs();
    };
    window.addEventListener('pagehide', this._sharedBarStoreReleaseUnloadHandler);
}
```

This matters more than the other three because bars are the dominant memory driver — **23.98 MB per
thousand resident bars**, measured this morning — and 82% of resident bars are pre-session history the
user never asked for.

## Why the early return is there, and why it still has to change

**The early return is defensible in isolation.** If the document goes into bfcache the user may press
Back, and a restored document whose bar store has been cleared underneath it would be broken. Releasing
without a restore path would trade a memory bug for a correctness bug.

**And there is no restore path.** The only `pageshow` listener in the whole bundle is
`_handleViewportRefresh` at line 1572 — a viewport refresh, not a re-acquisition. Nothing re-hydrates a
released bar store on restore.

So this is a **pair**, not a one-liner, and A should not be sent at half of it:

1. **The cheap option, using machinery that already works.** Make the heavy document **bfcache-ineligible**
   — a `Cache-Control: no-store` on the document response is the standard lever. Then `persisted` is never
   `true`, all four existing hooks fire on every exit, and the return axis is served by code that is
   already written and already shipped. The cost is losing instant Back, on a charting app where Back is
   not a primary gesture.
2. **The complete option.** Drop the early return AND add a `pageshow`-with-`persisted` handler that
   re-acquires the bar store, host cache and catch-up state. Strictly better for users, materially more
   work, and it needs its own correctness testing.

**I recommend option 1 for the canary and option 2 after**, because option 1 turns four dead hooks live
without writing any new release logic.

## What this does and does not settle

It settles the *mechanism* of the staircase completely, and per `KILL-02` it converts "Chrome's cache is
holding our document" from an exoneration into a located line of our own code. It does **not** settle the
*magnitude*, which is what the Director asked for and what is running now: a heavy `CONF-01` session
carrying at least a gigabyte above first paint, taken through reload, logout and tab close separately.

One scoping decision, stated up front rather than discovered later: **only the logout exit can use
bfcache.** A reload replaces the same document and a tab close destroys it, so neither is a back-forward
cache path and neither arm can differ on them. The two-arm requirement therefore bites on logout, and
that is where the second arm is being spent.

## Correction to my own scan, caught before it was reported

My first pass concluded "**NO** pagehide handler releases memory" — and that was an artifact of a regex
that could only find `function foo(` and `const foo =` definitions, so it failed to locate four handlers
whose own **names** contain the word Release. The corrected reader reports INCONCLUSIVE when it cannot
find a body, rather than reporting absence. A count of handler mentions can never answer this question;
only reading them can.

## The three retirements the Director confirmed stand

Unchanged and not re-tested: **storage does not grow** (1,797 bytes in all six readings), **the service
worker pins nothing** (0 registrations, not controlled, caches nothing), **logout is a genuine
cross-document navigation**. Three suspects dead on the return axis.

## And the record on the clearing arm

The Director is right that the arm which cleared us was destroyed by my own environment leak, and right
that the numbers were briefly in a commit body with nothing on disk behind them. It has since been
re-run and is on disk at `SESSION-RESET-NOBFCACHE-20260731.json`, signature `SESSION-RESET-V1`, arm
`bfcache-disabled`, written 12:09 — **nineteen minutes after the ruling was written, so the check was
accurate when it was made.** What is on disk is a **replication, not the original**: documents `[2,2,2]`
identical, heap within 0.16 MB, and footprint growth **−9.5 MB** where the original read +14.7 MB. The
original run is gone permanently. Configuration now comes from arguments rather than the environment, and
a signature-versus-filename audit is part of publishing.
