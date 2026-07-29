# MANAGER-C-W79 — which peer realm survives

One assignment, one answer.

**Panel B — the first peer — is retained on every cycle.** Measured in two
independent 3-cycle deployed runs with the distinct-dataset PO workload: cycles
1, 2 and 3 each leave a B realm behind. Panels C and D are retained only when
they get far enough before the collapse, and the youngest C/D generation that
is present at one snapshot is gone by the next — they are collected lazily, B
never.

## How identity was obtained

A destroyed iframe's `Window` loses its URL in a heap snapshot. At 3 cycles
there are 12 bare `Window [JSGlobalObject]` nodes and only the live host keeps
its origin, so no dead realm can be told from any other. `REALM-TAG-V1` writes
`window.__TALARIA_REALM_TAG__` into each panel frame after the workload is
armed, and a retained realm carries its own name into the snapshot. The tag
cannot cause retention — the realm's window holds the string, not the reverse.

The host realm is tagged too as a built-in control: the top page is never
reloaded, so its tag is overwritten each cycle, and exactly one host tag
survives in both runs. Overwritten tags do get collected, so a surviving tag
means a surviving realm.

## What distinguishes the survivor

A peer realm is retained if and only if it holds an `_indicatorWorkerSingleton`
— if and only if its indicator subsystem reached the point of creating a worker.
6/6 retained realms in the control, 7/7 in the ablation, and no collected peer
realm has one, in either run.

That is the discriminator, not the anchor. The singleton and its `Worker` live
*inside* the realm, so they cannot hold it from outside — and terminating every
panel worker immediately before its collapse did not reduce the rate
(+30.24/+20.86 MB against the control's +26.93/+18.79, inside the ±2.73 MB/cycle
band from W76) and left B retained on all three cycles. **`terminate()` is not
the fix.**

Retention frequency follows panel creation order rather than dataset identity:
B 3/3, C 1/3 then 2/3, D 1/3, with all three panels on different files and the
same timeframe. The reading is that the first peer reliably finishes indicator
initialisation before the collapse and the later peers race it.

Against the three candidates named for this packet: it is **not** the
last-focused panel (`focusedPanelId` is the host `A` throughout) and **not** the
panel that received an order (the PO workload orders on the host). It is
partly the indicator-worker panel — but retention tracks having initialised the
indicator subsystem, not holding a live worker.

## For Manager A

The teardown path that fails is **panel realm release after indicator
initialisation**. The collapse destroys the iframe; a realm whose indicator
subsystem has initialised is never collected. One such realm per cycle is
20.87 MB of the 23.53 MB floor delta (W78), 89%.

## Still open

The out-of-realm reference itself is not found. Inbound enumeration on the
retained `Window` and `NativeContext` returns only intra-realm Blink internals
and the realm's own closures — a circular cluster with no product-side holder
within two levels — and the spanning tree's root path is the generic V8
`(Eternal handles)` → `FunctionTemplateInfo` → `WeakMap` chain, which is not a
product reference. One-line falsifier for the order hypothesis: permute the
dataset assignment so B holds D's file; if B still survives, retention is the
slot, not the data.

## Snapshot ceiling

Runs held at 3 cycles. Parsed this packet: control 308.3 MB and 336.7 MB,
ablation 308.9 MB and 356.8 MB. Six cycles produces ~560 MB, above V8's max
string length, and cannot be parsed at all. `--snapshot-out` moves the parse out
of the browser process but does not lift that ceiling.
