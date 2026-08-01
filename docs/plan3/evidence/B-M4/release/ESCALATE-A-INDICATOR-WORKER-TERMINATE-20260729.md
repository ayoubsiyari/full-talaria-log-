# ESCALATE → Manager A: indicator worker singleton is never terminated

**From:** Manager B (release / ship-gate) — packet B-W20 (TIMER-OUTLIVES-OWNER sweep)
**Date:** 2026-07-29
**Territory:** `chart v 1.4/chart/modules/chart-indicators-full.js` is A's. B did not edit it.
**Detail + reachability argument:** `observations/B-W20-escalate-worker-leak.md`

## Defect

`chart v 1.4/chart/modules/chart-indicators-full.js:8009` — `_getIndicatorWorker()` lazily
creates `new Worker('/chart/workers/indicator-worker.js')` into a module-scope singleton.
The module contains no `.terminate()` anywhere, and no owner-teardown hook nulls the
singleton or rejects `_workerPending`.

In multichart each panel iframe is its own JS realm, so each panel gets its own singleton.
Removing a panel is the natural-death path for that realm and nothing terminates the worker.

## Why this is not just a source smell

Manager C's browser scheduler census independently reports **workers +1 per multichart
open/close cycle, never terminated**. The per-iframe singleton is a mechanism that produces
exactly that number, arrived at from source without seeing C's census. Two independent
methods agreeing on the same count is the strongest evidence we have on this class.

## Requested fix (A's call on shape)

A module-owned `disposeIndicatorWorkerSingleton()` that terminates the worker, nulls the
singleton, and rejects + clears `_workerPending`, wired to the teardown path that always
runs when a panel iframe is removed.

Reserved kill-switch, default the fix ON:
`__TALARIA_DISABLE_INDICATOR_WORKER_SINGLETON_TERMINATE_V1`.

Per the flag-bisect protocol the switch must satisfy FLAG-01 (absent ⇒ fix ON, truthy
disables, never require explicit `false`), FLAG-02 (read at each decision point, no reload
to flip), FLAG-03 (with the switch truthy the product still works — indicators still
calculate on the legacy path), and Independence (observable by flipping only itself).

## Second site — evidence request, not an escalation

`chart v 1.4/chart/modules/custom-indicators-runtime.js:70` creates a blob worker and
terminates it at `:168` **only on the timeout path**. Whether normal panel teardown reaches
a terminate is UNPROVEN from source. The measurement that settles it: run a custom
indicator in a panel, close the panel before the timeout fires, and check whether the blob
worker count returns to baseline without waiting for timeout or error.

## Gate that holds this finding

`chart v 1.4/talaria-design/src/timer-outlives-owner-sweep.test.mjs` carries the cell
`indicator-worker-singleton-leak-escalation`. It reads the product file and goes RED if the
leak evidence is edited away without a real fix, so the escalation cannot be closed by
deleting the note. When A lands the terminate, that cell must be re-pointed from
"leak present" to "terminate present" in the same change.
