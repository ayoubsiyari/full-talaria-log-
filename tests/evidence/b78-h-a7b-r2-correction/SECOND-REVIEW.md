# H-A7b-R2 second-review packet

Follow-up to blocked commit `e0fe6b683`.

## Causal setup correction

The row no longer uses the generic `grid.runCommand("loadFile")` path or treats
eventual file identity as command acknowledgement. It writes an owner/session
bound panel passport through authenticated `userStorage`, invokes the real
`MC_RESTORE` epoch/generation API, and waits for the manager's exact returned
generation, panel, and file acknowledgement.

Geometry is unreachable until all of these hold:

- authenticated owner and fixed session passport;
- manager generation equals applied and acknowledged generation;
- acknowledged panel B / file 27;
- chart identity file 27 / GBPUSD / expected session and timeframe;
- target `chartDataLoaded` observed;
- finite ordered data with more than 50 bars;
- pair load complete;
- render counter and canvas dimensions ready.

The product manager owns its existing three-attempt bounded transient dispatch.
The harness creates one ownership generation and does not retry setup after a
semantic identity/readiness failure.

## Identical setup snapshot

All ON and OFF runs emitted this same semantic snapshot before branching:

```json
{"owner":"authenticated","panelId":"B","fileId":"27","ticker":"GBPUSD","sessionId":"h-a7b-r2-auth-session","timeframe":"1m","generationAcknowledged":true,"chartDataLoaded":true,"dataReady":true,"renderReady":true}
```

## Browser evidence

Pinned ordinary host/server, isolated browser per run:

- ON: 3/3 entered geometry, 3/3 PASS.
- OFF: 3/3 entered geometry, 3/3 FAIL, final `FAIL-REAL-BUG`.
- SETUP_INVALID count across these six runs: zero.
- ON geometry remained `marginR=61`, `marginB=30`, `axisW=61`,
  `crush=false`, `floorOk=true`.
- OFF used the unchanged assertions and direct mechanism probe.

Alternate clock/server (`TZ=Pacific/Auckland`, port 18974):

- ON: entered geometry and PASS.
- OFF: entered geometry and FAIL-REAL-BUG.
- Both used the identical semantic setup snapshot above.

Packet terminal proof:

- `--runs=3 --ha7b-r2-anchor-invalid` executed one run only;
- final classification was `SETUP_INVALID`;
- runner printed that the packet terminated and the result was neither RED nor
  GREEN.
