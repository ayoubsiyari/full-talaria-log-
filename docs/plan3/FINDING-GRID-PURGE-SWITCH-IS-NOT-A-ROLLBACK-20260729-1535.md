# FINDING — the grid-purge kill-switch reverts to a broken state (2026-07-29 15:35)

## What the PO did

On b90, set `window.__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1 = true` and reloaded, at my
instruction, to test whether that fix caused the missing splitter borders.

**Three of four panels went black.** Console shows `No fullRawData available` three times from
`replay-system.js:3906` — one per dead panel.

## Two results, and the second is the important one

### 1. The border regression is real — the bundle is not stale

`[MultichartGrid] mounted, BRIDGE_VERSION = 20260729b90` served from
`talaria-v9-live.js?v=20260729b90`. That matches `chart.js` at b90. The stale-bundle hypothesis,
which the code's own diagnostic comment invited, is **refuted**. The missing splitter borders are a
genuine regression and still need an owner. It is not the grid purge — see below.

### 2. `__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1` is not a rollback

Reading PURGE-2, the disabled path is not "the old working behaviour." It is the old **broken**
behaviour, and the fix's own comment says so:

```js
orderSyncedPanelsRef.current.delete(existingId);
clonedPanelsRef.current.delete(existingId);
// Fresh iframes for a recycled id need host clone/order priming again;
// legacy skipped both because these id sets survived layout removal.
bumpPanelLoadGeneration(existingId);
```

With the switch on, recycled panel ids are never re-primed, so fresh iframes never receive host
clone or order priming and never get data. Hence `No fullRawData available` and black panels.

PURGE-2 was written as a memory fix and **incidentally fixed a data-priming defect**. Its
kill-switch therefore reverts a bug fix nobody knew they had shipped.

## Why this is a canary-grade problem

Our entire operating model this week rests on: ship fast, behind switches, roll back if wrong. That
guarantee is void for any switch whose off-path is broken. If a canary user hits trouble with the
grid purge, the documented rollback blacks out their charts — strictly worse than the defect.

Every switch shipped under the multi-fire ruling now needs this check. We verified FLAG-01
(testable when absent) and FLAG-02 (flippable without reload). **We never verified that the
disabled path still produces a working product.** That gap is mine.

Promote **FLAG-03**: a kill-switch must be verified in the OFF state against a working-product
assertion, not merely against "the feature is inactive." A switch whose off-path is broken is not a
rollback and must be documented as one-way, or the off-path must be repaired.

## Orders

- **PO:** flag cleared, back to default. Do not use this switch again.
- **B (owns PURGE-2):** either repair the off-path so disabling the purge still primes recycled
  panels, or reclassify the switch as one-way and say so in the canary runbook. Repair is strongly
  preferred; a one-way switch on a leak fix in the canary build is a liability.
- **B:** sweep every switch shipped today for the same defect — boot with the flag ON and assert the
  product still works, not merely that the feature is off. This is the coverage gap A self-reported
  yesterday, now proven to bite.
- **Splitter borders:** still unowned and still a real regression. Not caused by the grid purge.
  Assign after the current build ships; it is cosmetic and nothing else is blocked on it.

## Note on method

This is the second time today that testing a fix's OFF state produced information the ON state
could not. The first was FIX 1's frozen panels. The off-path deserves the same rigour as the
on-path, and until today it has not had it.
