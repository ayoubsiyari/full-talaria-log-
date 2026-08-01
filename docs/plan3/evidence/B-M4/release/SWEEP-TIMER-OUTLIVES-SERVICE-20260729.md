# Sweep - timers that can outlive the thing they service

Packet: B-W20  
Tree read: `C:\Users\user\Desktop\talaria1\manager-b-plan3` (`manager-b/plan3-20260727`)  
Date: 2026-07-29

This replaces the earlier inspection-only census. The gate is `chart v 1.4/talaria-design/src/timer-outlives-owner-sweep.mjs`; the harness is `chart v 1.4/talaria-design/src/timer-outlives-owner-sweep.test.mjs`. The library reads real product source files off disk and fails closed if an expected file is missing.

## Census Result

Command:

```text
node --input-type=module -e "import { analyzeTimerOutlivesOwnerSweep } from './chart v 1.4/talaria-design/src/timer-outlives-owner-sweep.mjs'; const a=analyzeTimerOutlivesOwnerSweep({root:process.cwd()}); const byKind={}; for (const s of a.census) byKind[s.kind]=(byKind[s.kind]||0)+1; console.log(JSON.stringify({root:a.root,totalStartSites:a.census.length,counts:a.counts,byKind,proved:a.census.filter(s=>s.assertion).map(s=>({assertion:s.assertion,verdict:s.verdict,file:s.file,line:s.line,kind:s.kind,cleanup:s.cleanup,cleanupPaths:s.cleanupPaths}))}, null, 2));"
```

Output summary:

```json
{
  "root": "C:\\Users\\user\\Desktop\\talaria1\\manager-b-plan3",
  "totalStartSites": 1349,
  "counts": { "CLEAN": 6, "DEFECT": 1, "UNPROVEN": 1342 },
  "byKind": {
    "window.addEventListener": 236,
    "requestAnimationFrame": 259,
    "document.addEventListener": 228,
    "setTimeout": 536,
    "parent.addEventListener": 4,
    "setInterval": 58,
    "new MutationObserver": 5,
    "new Worker": 7,
    "new BroadcastChannel": 3,
    "new ResizeObserver": 6,
    "new WebSocket": 5,
    "window.requestAnimationFrame": 2
  }
}
```

Machine-readable proved cells and mutation result: `docs/plan3/evidence/B-M4/release/observations/B-W20-census-summary.json`.

## Proved Cells

| Verdict | Site | Owner | Cleanup evidence | Paths proved |
|---|---|---|---|---|
| CLEAN | `chart v 1.4/talaria-design/src/TalariaV8bLive.jsx:15119` | support inbox WS ping | `supportClearPingTimer` clears interval; `ws.onclose` reaches `supportDisconnectWs`; tick self-clears when `readyState !== WebSocket.OPEN` | reconnect/unmount; current-socket `onclose`; CLOSED/CLOSING tick |
| CLEAN | `homepage/src/app/dashboard/v16/V16SupportChatPopover.tsx:311` | V16 support inbox WS ping | `clearPingTimer` clears interval; `ws.onclose` and effect cleanup reach `disconnectWs`; tick self-clears when `readyState !== WebSocket.OPEN` | panel close/effect cleanup; current-socket `onclose`; CLOSED/CLOSING tick |
| CLEAN | `chart v 1.4/talaria-design/src/MultichartGrid.jsx:4231` | replay alignment poll | effect cleanup clears `replayAlignGuard` | layout returns to 1/unmount; replay-system patch restore |
| CLEAN | `chart v 1.4/talaria-design/src/MultichartGrid.jsx:7946` | host order-bus retry poll | effect cleanup clears `hostBusRetryInterval` by default; self-clears on bus ready/50 attempts | bus ready/timeout; React unmount natural death |
| CLEAN | `chart v 1.4/chart/modules/preferences-sync.js:385` | cloud preferences debounce | reschedule clears prior `syncTimer`; subscription-block path clears pending debounce | later schedule; 403/subscription blocked |
| CLEAN | `chart v 1.4/chart/modules/preferences-sync.js:824` | preferences owner poll | `stopOwnerWatch` clears `ownerTimer` | `ownerReady`; `OWNER_POLL_MAX` |
| DEFECT | `chart v 1.4/chart/modules/chart-indicators-full.js:8009` | indicator worker singleton | no `.terminate()` in owning module | reachable custom indicator worker path; iframe/panel death has no source cleanup |
| UNPROVEN | `chart v 1.4/chart/modules/custom-indicators-runtime.js:70` | custom indicator runtime worker | timeout path terminates worker at `:168`; normal panel teardown not established | timeout/error proved; panel teardown UNPROVEN |

All raw start-site rows not listed above remain UNPROVEN. I did not round any inspection-only row to CLEAN.

## Fixed In B-W20

`chart v 1.4/talaria-design/src/MultichartGrid.jsx` had an in-set defect: `hostBusRetryInterval` was cleared on effect teardown only when the unrelated `__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1` fix was enabled. With that switch truthy, unmount could leave the retry interval alive until its own 5s ceiling.

Fix: added default-on cleanup switch `__TALARIA_DISABLE_MC_HOST_BUS_RETRY_TIMER_CLEANUP_V1`. The cleanup clears the retry interval unless that switch is truthy, and reads nothing else. The timer still self-clears on bus ready or max attempts.

**Correction after TOP re-review (B-R9, packet D2).** The first form of this fix gated the clear on `mcHostBusRetryTimerCleanupV1Enabled() || mcGridStatePurgeV1Enabled()`. That is a safe superset behaviourally, but the OFF path cannot be reached by flipping the new switch alone — PURGE-2 has to be disabled too. That is a welded switch, which the flag-bisect protocol blocks under Independence. The gate now carries a cell that goes RED on that exact disjunction, and `purge2-grid-ref-release.test.mjs` carries `PG-3 FLAG-01`, which asserts both directions: the new switch alone suppresses the clear, and disabling PURGE-2 alone does not.

## Escalated

`chart v 1.4/chart/modules/chart-indicators-full.js:8009` is Manager A territory and was not edited. Escalation: `docs/plan3/evidence/B-M4/release/observations/B-W20-escalate-worker-leak.md`. Reserved switch: `__TALARIA_DISABLE_INDICATOR_WORKER_SINGLETON_TERMINATE_V1`.

## Mutation Proof

Command:

```text
node --test "chart v 1.4/talaria-design/src/timer-outlives-owner-sweep.test.mjs"
```

Output:

```text
✔ clean tree passes source-reading timer-outlives-owner sweep (1096.8906ms)
✔ fail-closed: missing expected product file fails loudly (28.9918ms)
✔ mutation: reintroducing Talaria live WS ping immortality goes RED (238.2906ms)
✔ mutation: reintroducing V16 WS ping immortality goes RED (175.1198ms)
✔ mutation: removing replayAlignGuard cleanup goes RED (187.6333ms)
✔ mutation: reverting host bus retry timer cleanup fix goes RED (194.7827ms)
✔ mutation: welding the host bus switch to the purge switch goes RED (177.7872ms)
✔ mutation: removing preferences sync debounce cleanup goes RED (188.0668ms)
✔ mutation: removing owner watch interval cleanup goes RED (188.3493ms)
✔ mutation: removing indicator-worker leak evidence goes RED (178.1995ms)
ℹ tests 10
ℹ suites 0
ℹ pass 10
ℹ fail 0
```

Designed mutants: 8. Survived: 0. Survivors: none. (The eighth is the anti-weld
mutant added when B-R9's D2 was applied.)

## What This Sweep Does Not Close

1349 start sites; 8 carry a proved verdict. The other 1342 are UNPROVEN, not CLEAN — no
row was rounded up. The class this packet was opened for (a serviced resource whose timer
or worker outlives its owner) is **not closed**, and the honest state is: the two WebSocket
ping timers that opened the class are proved dead, four more retainers are proved clean,
one in-set defect is fixed, and one out-of-set defect is escalated with a browser-side
count that agrees with the source reading. Closing the remaining 1342 needs either
per-site work or a stronger automatic rule than "does the owning module contain a matching
release call".
