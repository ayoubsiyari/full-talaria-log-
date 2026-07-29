# Sweep — timers that can outlive the thing they service

**When:** 2026-07-29  
**Trigger:** Support WS ping interval immortal after browser `onclose` (background tab).  
**Claim bound:** log spam + small permanent retain of a dead `WebSocket`. **Not** the idle-CPU (18.8%) fix.

---

## Fixed this ship

| Site | Defect | Fix |
|---|---|---|
| `talaria-design/src/TalariaV8bLive.jsx` support ping | `onopen` starts 30s `setInterval` send; `onclose` nulls ref only | `readyState === OPEN` guard; clear interval when not open; `onclose` → `supportDisconnectWs()`; kill-switch `__TALARIA_DISABLE_SUPPORT_WS_PING_CLEANUP_V1` |
| `homepage/.../V16SupportChatPopover.tsx` | Same twin | Same; also unmount cleanup when panel was open |

Harness: `talaria-design/src/support-ws-ping-cleanup.test.mjs` (FLAG-01/02 four-state).

---

## Class census (pack / B-writable surfaces)

| Site | Verdict |
|---|---|
| `TalariaV8bLive.jsx` other `setInterval`s (OM bump, mc poll, replay sync, HUD, theme, toolbar hook) | **OK** — effect cleanup clears |
| `TalariaV8b.jsx` OM bump | **OK** — cleanup clears |
| `V9ReactPlaceOrder.jsx` 180ms poll | **OK** — cleanup clears |
| `MultichartGrid.jsx` replayAlignGuard / hostBusRetry | **OK** — cleared on teardown |
| `viewport-data-manager.js` WS ping | **OK already** — `onclose` clears interval (pattern to copy); chart-module, left alone |
| `SupportInbox.tsx` | No ping interval; ref-null on close only |
| `chart.js` / `order-manager.js` / `replay-system.js` timers | **Out of B write set** — escalate to A if a retain is proven |

---

## Pattern to keep hunting

`setInterval` / chained `setTimeout` started when a socket, panel, or DOM owner is created, with cleanup only on the *happy* teardown path (`disconnect()` / effect return) and not on the *natural death* path (`onclose`, `pagehide`, owner replaced). Pack clones of the same UI are the highest-yield next places.
