/**
 * N3 — a 30-second offline toggle mid-replay, asserting no request storm.
 *
 * The failure this hunts: a chart that loses the network and answers with unbounded retries, so a
 * commuter through a tunnel returns to a browser that has queued thousands of requests. The assertion is
 * about the RECOVERY as much as the outage — a storm on reconnect is the same defect arriving late.
 *
 * A QUIET RESULT ONLY MEANS SOMETHING IF THE OUTAGE WAS REAL. The probe therefore proves the network was
 * actually down (a request attempted during the window must fail) before it is allowed to report "no
 * storm". Without that, an offline toggle that silently failed to apply reports a perfect pass, which is
 * the vacuous shape that has cost me twice tonight.
 */

export async function offlineToggle(page, {
  offlineMs = 30000,
  recoveryWatchMs = 30000,
  stormFactor = 5,          // requests/s over baseline that counts as a storm
  log = () => {},
} = {}) {
  const client = await page.createCDPSession();
  const out = { signature: 'OFFLINE-TOGGLE-V1', offlineMs, recoveryWatchMs, startedAt: new Date().toISOString() };

  const events = [];
  const onReq = (p) => events.push({ t: Date.now(), phase: 'sent', url: String(p.request?.url || '').slice(0, 120) });
  const onFail = (p) => events.push({ t: Date.now(), phase: 'failed', err: p.errorText });
  const onDone = () => events.push({ t: Date.now(), phase: 'finished' });

  await client.send('Network.enable');
  client.on('Network.requestWillBeSent', onReq);
  client.on('Network.loadingFailed', onFail);
  client.on('Network.loadingFinished', onDone);

  const countIn = (from, to) => events.filter((e) => e.phase === 'sent' && e.t >= from && e.t < to).length;

  try {
    // Baseline while online, so "a storm" is measured against this session rather than a guess.
    const b0 = Date.now();
    await new Promise((r) => setTimeout(r, 15000));
    const b1 = Date.now();
    const baselineRps = countIn(b0, b1) / ((b1 - b0) / 1000);
    out.baselineRequestsPerSec = +baselineRps.toFixed(2);
    log(`offline-toggle: baseline ${out.baselineRequestsPerSec} req/s`);

    // Offline.
    await client.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const o0 = Date.now();

    // PROVE the outage is real rather than trusting the toggle.
    const proof = await page.evaluate(async () => {
      try {
        const res = await fetch(`/api/__offline_probe_${Date.now()}`, { cache: 'no-store' });
        return { reachedNetwork: true, status: res.status };
      } catch (e) { return { reachedNetwork: false, error: String(e).slice(0, 100) }; }
    }).catch((e) => ({ reachedNetwork: null, evalError: String(e).slice(0, 100) }));
    out.outageProof = proof;
    out.outageVerified = proof?.reachedNetwork === false;

    await new Promise((r) => setTimeout(r, Math.max(0, offlineMs - (Date.now() - o0))));
    const o1 = Date.now();
    out.offlineRequestsSent = countIn(o0, o1);
    out.offlineRequestsPerSec = +(out.offlineRequestsSent / ((o1 - o0) / 1000)).toFixed(2);
    out.offlineFailures = events.filter((e) => e.phase === 'failed' && e.t >= o0 && e.t < o1).length;

    // Back online, and watch the recovery.
    await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const r0 = Date.now();
    await new Promise((r) => setTimeout(r, recoveryWatchMs));
    const r1 = Date.now();
    out.recoveryRequestsSent = countIn(r0, r1);
    out.recoveryRequestsPerSec = +(out.recoveryRequestsSent / ((r1 - r0) / 1000)).toFixed(2);

    const bar = Math.max(baselineRps * stormFactor, 5);
    out.stormBarRequestsPerSec = +bar.toFixed(2);
    const stormOffline = out.offlineRequestsPerSec > bar;
    const stormRecovery = out.recoveryRequestsPerSec > bar;

    if (!out.outageVerified) {
      out.verdict = 'VOID';
      out.why = `the outage was not proven — a fetch during the offline window ${proof?.reachedNetwork ? 'REACHED the network' : 'could not be evaluated'}. A quiet reading from a session that never went offline proves nothing.`;
    } else if (stormOffline || stormRecovery) {
      out.verdict = 'REQUEST STORM';
      out.why = `${stormOffline ? `offline ${out.offlineRequestsPerSec}` : `recovery ${out.recoveryRequestsPerSec}`} req/s against a ${bar.toFixed(1)} req/s bar (${out.baselineRequestsPerSec} baseline x${stormFactor}).`;
    } else {
      out.verdict = 'NO STORM';
      out.why = `Outage verified. Offline ${out.offlineRequestsPerSec} req/s and recovery ${out.recoveryRequestsPerSec} req/s, both under the ${bar.toFixed(1)} req/s bar.`;
    }
  } catch (err) {
    out.verdict = 'VOID';
    out.why = `probe threw: ${String(err).slice(0, 160)}`;
  } finally {
    // Never leave a soak offline because a probe threw.
    try { await client.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); } catch { /* nothing further */ }
    try { client.off('Network.requestWillBeSent', onReq); client.off('Network.loadingFailed', onFail); client.off('Network.loadingFinished', onDone); } catch { /* nothing further */ }
    // Network.enable buffers response bodies; leaving it on for ten hours is an instrument-innocence
    // problem of exactly the kind my own audit exists to prevent.
    try { await client.send('Network.disable'); } catch { /* nothing further */ }
    try { await client.detach(); } catch { /* nothing further */ }
  }
  return out;
}
