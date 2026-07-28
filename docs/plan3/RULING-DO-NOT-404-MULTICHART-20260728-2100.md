# RULING — B's census remedy 404s `/chart/multichart/`, and `multichart-manager.js:466` loads panel iframes from `chart-host.html`. Apply the P6 standard to itself: prove the consumer before blocking the route. Prefer redirect over 404 everywhere. And if that route IS live, it serves `a10` and reframes our entire multichart investigation.

**2026-07-28 21:00. Caught while reading B-0139. The remedy has not landed — it lands with A's restore — so there is time.**

---

## 1. What B is about to do

**From B-0139:** *"Same commit **404s** the other census holes under `/chart/multichart/` and the two harness prefixes."*

**The census found `/chart/multichart/chart-host.html` serving build `a10` against a field current of `b75`.** B's remedy is to 404 it.

## 2. Why that is dangerous — the route has a producer in the product code

```
chart v 1.4/chart/multichart-prod/multichart-manager.js:466
    frame.src = 'chart-host.html?' + params.toString();
```

**That is how every multichart panel loads.** And line 4 of the same file: *"Parent shell orchestrator. Lives ONLY in the shell page (multichart-shell.html)."* **Both filenames B plans to block are the two halves of the multichart feature.**

**So a 404 under `/chart/multichart/` is a candidate for breaking multichart outright.**

## 3. The nuance that decides it, and why it must be tested rather than reasoned

**`frame.src` is relative.** It resolves against whichever page hosts the manager. **So `/chart/multichart/chart-host.html` is either the live panel loader, or a stale duplicate of it sitting at a path nothing uses.**

**Both readings are consistent with what we know, which is exactly why this needs a probe and not an argument:**

- **If it is a stale duplicate**, 404 is harmless and B's instinct was right.
- **If it is live, multichart has been running build `a10` this entire time** — and every multichart fix since then, including the speed cap and the teardown work, never reached the feature the PO has been complaining about. **That would reframe the whole lag and memory investigation.**

**I judge the duplicate reading more likely, because the PO has observed multichart behaviour changing in response to our builds.** But *more likely* is not the standard we set two hours ago.

## 4. The ruling — the P6 standard applies to B's own remedy

**B held the push because deleting a route that returns 200, without evidence that nothing requests it, is unsafe under a single-push deployment. That was correct and I ratified it.**

**404ing `/chart/multichart/` is the identical action against the identical uncertainty.** The only difference is that this time the route was found by B rather than by A, and **a standard that applies to other people's changes and not your own is not a standard.**

**Ordered: before any 404 lands, open multichart on the test host and read the panel iframe URLs.** If panels resolve to `/chart/multichart/chart-host.html`, the route is live: **do not block it, and escalate immediately, because the `a10` stamp then becomes the most important finding of the day.** If they resolve elsewhere, the route is a stale duplicate and may be blocked.

**This is minutes of work and it is the same probe that settled P6.**

## 5. A general correction — prefer redirect to 404 throughout

**B chose `302` for P6 and `404` for the census holes. I see no justification for the asymmetry and it should be resolved in favour of the safer option.**

**The requirement in my 20:30 ruling was that a route stops serving stale code. A redirect to the canonical shell satisfies that completely.** A 404 satisfies it too, but additionally breaks anything that was using the route — **so 404 buys nothing over redirect except risk.**

**Ruling: redirect by default. 404 only where a route is proven unused, and "proven" means a probe, not an absence of imagination.** The harness prefixes are plausibly the one place a 404 is genuinely right, since a test harness having no production consumer is a much safer claim than a file named `chart-host.html` having none.

## 6. Credit, because B earned it in the same entry

**B executed four of five dispatched items in thirty-eight minutes**, built the census tool rather than probing by hand, sealed the JSON, closed all remaining paths on its fourteen-path list to **OPEN = 0**, and produced the post-push runbook.

**And the census did exactly what I hoped: it generalised an accidental discovery into a systematic one, and it found three more holes beyond P6.** `/chart/multichart/chart-host.html` at `a10`, an unstamped `multichart-shell`, and the m20/m21 harness HTML. **The finding is excellent. It is the remedy that needs correcting, not the work that produced it.**

## 7. One reassurance from the census worth recording

**Primary V9, embed, engine and service worker are all coherent at `b75`.** The core delivery path is sound and merely behind the train, which is what the push fixes. **The holes are peripheral routes, not the main one** — so this is a tidy-up with one dangerous edge, not a delivery crisis.
