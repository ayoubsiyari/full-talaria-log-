# Manager C — W75 evidence (slim)

Leak-hunt extensions + calib default. tier=mid model=cursor-grok-4.5

| File | What |
|---|---|
| `w75-heap-b85-default-po-hand.slim.json` | **P0** Deployed default is PO-hand (not layout-only +0.69). Hot mean ~25.9 on b85 |
| `w75-worker-attribution.slim.json` | **P1** Worker = `indicator-worker.js` / `_getIndicatorWorker`; +3 create/cycle, survivors=1 |
| `w75-external-string-retainer.slim.json` | **P2** ExternalStringData path produced; dominant class script-source (~48MB) |
| `w75-cpu-ceiling-60x.slim.json` | **P3** Single-chart 60× ceiling stacks (m20Q6 + Chart.animate) |
| `w75-idle-floor-ab.slim.json` | **P4** Idle 7.79% remainder — still OPEN (AB short timed out) |
