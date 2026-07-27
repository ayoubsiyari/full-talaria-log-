# H-A8-VP-2 repeated identity diagnostic

Verdict: (A) same mechanism with environment-dependent/flaky output, identifying nondeterministic field/source

Nine fresh runs (3 each) produced the same failure signature `0aa54b27c1a97e87a5ab9ebf3bd223c56e68d4ef7c1d0be9f61b0a8a2fc071a4`, event shape, focus/DPR state, geometry, coordinates, assertion text, and source digests.
The full raw artifacts differ through generated UUID, ports, wall/performance time, host monotonic time, rAF counters, and whether the asynchronous recovery update is first observed at event 114 or 115; those timing ranges overlap across B75, B77, and B78.

Failure: the first expected drag frame is event 83 at pointer [462.1666666666667,665.5], but geometry remains bar=614 price=1.10963 through drag-end event 108. The later settings-recovery double-click applies price=1.10865 at scheduling-dependent event 114/115; by event 118 both live geometry and coordinates are bar=614 price=1.10865, while the earlier geo2 assertion snapshot remains 614/1.10963. CORE-B and CORE-B-prime therefore fail in every run.

No F5/V1/V2/V5 bisect was run because no commit-specific failure difference was observed.
