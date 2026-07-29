# FINDING — Confirmed by measurement: **JS heap 231 MB against a 670 MB Task Manager footprint.** Roughly two thirds of every memory number in this project is not JavaScript memory. The prediction made at 02:00 held, Task Manager is retired as the memory instrument, and **the memory problem is materially smaller than the whole project has believed.** The TradeZella comparison is void in its current form.

**2026-07-29 02:05. PO ran the heap read immediately after a refresh on a single chart whose footprint had not dropped from 670 MB.**

---

## 1. The number

**`231 MB heap`, with footprint at 670 MB. A gap of ~439 MB, meaning footprint over-reports live JavaScript memory by about 2.9×** at that moment.

**The 02:00 prediction was that a small heap against a large footprint would prove the residue was unreturned allocator pages. That is what happened, and it is now settled rather than argued.**

## 2. What this does to the record

**Every absolute memory figure gathered tonight and earlier is inflated by a large, variable, unknown factor.** The 1.4 GB peak, the 600 MB settle, the 367 MB residue, the 2.5 GB pre-`b74` alarm, the 1.24 GB idle background-tab reading — **all footprint. None are measurements of retained application memory.**

**The differentials survive intact**, for the reason given at 02:00: a shared systematic offset cannot manufacture a fivefold gap between two readings taken minutes apart on the same instrument. **So four distinct-symbol panels really do retain meaningfully more than four identical ones, and the amended kill order remains correctly aimed.** **What we have lost is the magnitude, not the mechanism.**

**The TradeZella comparison is void as stated.** Their 490 MB was read from the same footprint column. **Comparing our 231 MB heap against their 490 MB footprint is not a comparison at all.** Either both are read as heap, or the claim is withdrawn. **Given footprint 670 against their 490, and assuming similar allocator behaviour in the same browser, the honest current position is "somewhat worse," not the 3-5× the project has been operating on for two days.**

## 3. The consequence nobody has said out loud

**We have spent a substantial part of Plan 3 hunting a memory monster sized by an instrument that cannot measure memory.** **The Hoarder is real** — the symbol/timeframe differential proves something is retained — **but its published size was never evidence.**

**This also retroactively explains M26.** M26 was labelled `effect not demonstrated` because footprint did not move. **Footprint cannot move by less than the allocator's granularity, and a genuine release of tens of megabytes can be entirely invisible in it.** **M26 has never actually been tested. Neither has FIX 3.**

**Ruled: any fix previously graded `effect not demonstrated` against footprint is re-classified as `ungraded`, not `ineffective`.** That distinction matters for the canary disclosure, which currently under-claims work that may well be working.

## 4. The one measurement still required, now on the right instrument

**The cycle test, read as heap.** Fresh single chart heap, then four distinct-symbol panels played and stopped, then back to single — repeated three times without reloading, one heap reading at each return.

**Growth across cycles in heap is a real leak and is the only thing that can still block canary on memory grounds.**
**Flat heap across cycles means the residue is bounded, the Hoarder is a session-scoped cost rather than a leak, and memory stops being a canary blocker entirely.**

**Nothing else is outstanding on memory. This single sequence decides it.**
