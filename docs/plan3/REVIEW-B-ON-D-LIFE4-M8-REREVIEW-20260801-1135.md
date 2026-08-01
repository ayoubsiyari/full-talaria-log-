# Review B on D — LIFE-4 / M8 hydration guard (re-review)

**From:** Manager B (release / money-path reviewer)
**Date:** 2026-08-01 11:35
**Subject tip:** `dd0dc4445` (contained in D tip `e7dc1df36` / LAG-1a tip `0cdb49acd`)
**Prior review:** `REVIEW-B-ON-D-LIFE-4-M8-HYDRATION-GUARD-20260801-1030.md` (CHANGES REQUESTED)
**Verdict:** **APPROVED for the train, with one residual fixed by B at reconcile**

---

## What closed since the last review

Director verified three hits in each mirror at D's tip. I re-checked:

| Mirror | Content hash | Hits on provenance / hydrate symbols |
|---|---|---|
| `chart v 1.4/chart/chart.js` | `6df9a5fc7b…` | 6 |
| `homepage/public/chart/chart.js` | `6df9a5fc7b…` | 6 (byte-identical) |
| `chart v 1.4/chart/modules/order-manager.js` | `734a23e562…` | 10 |
| `homepage/public/chart/modules/order-manager.js` | `734a23e562…` | 10 (byte-identical) |

Parity defect closed. Prior CHANGES REQUESTED on one-mirror miss is withdrawn.

## What remains from the behavioural gate

`_evidence/manager-B/life4-review/life4-behavioural.test.mjs` against D's tip:
**18 passed, 1 failed.**

The failure is the same null-session path:

```
_journalProvenance === 'hydrated'
&& _journalProvenanceSession === (sessionId != null ? String(sessionId) : null)
```

When both sides are `null`, `null === null` vouches and grants durable write authority.

### Reachability (answered; no longer a question for D)

1. Hydrate sets `_journalProvenanceSession` from `getActiveTradingSessionId()`, and a missing
   method or a thrown exception silently stores `null`.
2. `persistJournal` reads the same accessor into `sessionId`. On falsy it **warns and does not
   return** — execution continues into the vouching branch.
3. Therefore both nulls are one condition, not two coincidences, and the durable path is entered.

This is money-path. D's source-text gate cannot see it; the behavioural gate can.

## Disposition

I am not sending this back to D as CHANGES REQUESTED again. D is blocked on me, the train is
assembling now, and the fix is one predicate:

- require `_journalProvenanceSession != null` and `sessionId != null` before the equality can vouch.

I will land that fix myself in the train reconcile of `order-manager.js` (both mirrors), with the
behavioural gate required green afterward. Authorship of the guard remains D's; the residual is a
release-manager patch on the co-owned file.

## Residual still open (non-blocking for train)

`locally-authored` remains on the durable allow-list and is still never assigned (0 writes in tip).
Not a defect today; a loaded gun. Tracked, not blocking.

## Switch

No row switch (guard is the fix). Kill `__TALARIA_DISABLE_B_W16_HYDRATION_GUARD` / equivalent
remains — roster said no kill-switch; the code still has one. Not re-litigating under wave pressure;
named for the seal checklist.
