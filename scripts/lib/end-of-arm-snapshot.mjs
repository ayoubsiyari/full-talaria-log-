/**
 * End-of-arm heap snapshot, taken AFTER the final sample so it perturbs nothing it measures.
 *
 * A ~1.5 GB renderer can write multiple GB of snapshot and can OOM the tab taking it. Every one of those
 * outcomes is acceptable at this point in the run and none of them may look like a lost soak, so:
 *
 *  - free disk is checked BEFORE the write and the attempt is skipped if headroom is thin,
 *  - the write is capped and aborted cleanly if it runs past the cap,
 *  - any failure is recorded as a logged NON-EVENT with its reason, and the arm still closes green.
 *
 * The snapshot is a by-product. The series is the measurement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MB = 1024 * 1024;

function freeDiskMB(forPath) {
  try {
    const drive = path.parse(path.resolve(forPath)).root.replace(/\\$/, '');
    const ps = `(Get-PSDrive -Name '${drive.replace(':', '')}').Free`;
    const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', timeout: 20000 });
    const bytes = Number(String(res.stdout || '').trim());
    return Number.isFinite(bytes) ? Math.round(bytes / MB) : null;
  } catch { return null; }
}

/**
 * @param {import('puppeteer').Page} page
 * @param {object} opts
 * @returns {Promise<object>} always resolves; never throws into the caller
 */
export async function takeEndOfArmSnapshot(page, {
  outFile,
  capMB = 4096,
  requireFreeMB = 12288,   // cap plus generous headroom: a full disk is its own outage
  timeoutMs = 600000,
} = {}) {
  const result = {
    attempted: false, ok: false, file: null, bytes: null, elapsedMs: null,
    skippedWhy: null, failedWhy: null,
    note: 'End-of-arm snapshot is a by-product taken after the final sample. Its absence is a logged non-event and does NOT invalidate the arm.',
  };

  const free = freeDiskMB(outFile);
  result.freeDiskMB = free;
  if (free != null && free < requireFreeMB) {
    result.skippedWhy = `free disk ${free} MB is below the ${requireFreeMB} MB required for a ${capMB} MB cap plus headroom. Skipped BEFORE writing rather than filling the disk the artifacts live on.`;
    return result;
  }

  result.attempted = true;
  const started = Date.now();
  let session = null;
  let written = 0;
  let aborted = false;
  try {
    session = await page.target().createCDPSession();
    const stream = fs.createWriteStream(outFile);
    let resolveDone; let rejectDone;
    const done = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });

    const onChunk = (ev) => {
      if (aborted) return;
      written += Buffer.byteLength(ev.chunk, 'utf8');
      if (written > capMB * MB) {
        aborted = true;
        result.failedWhy = `write passed the ${capMB} MB cap and was aborted cleanly at ${(written / MB).toFixed(0)} MB. A partial snapshot is discarded rather than published.`;
        stream.end();
        rejectDone(new Error('cap'));
        return;
      }
      stream.write(ev.chunk);
    };
    session.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    // Resolve on the stream's CLOSE, not on end(). The first version resolved the moment end() was called,
    // so the process went on to finish the run and exit while the write stream still held everything in
    // its buffer - and it reported ok:true with "386.8 MB written" beside a 0-byte file on disk. A
    // by-product that lies about existing is worse than one that is missing.
    stream.on('close', () => resolveDone());
    stream.on('error', (e) => rejectDone(e));
    session.on('HeapProfiler.reportHeapSnapshotProgress', (p) => { if (p.finished) stream.end(); });

    await session.send('HeapProfiler.enable');
    const take = session.send('HeapProfiler.takeHeapSnapshot', { reportProgress: true, captureNumericValue: false });
    await Promise.race([
      Promise.all([take, done]),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)),
    ]);

    // Verify the artifact rather than trusting the counter that produced it.
    const onDisk = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
    if (onDisk === 0 || onDisk < written * 0.99) {
      result.ok = false;
      result.bytesCounted = written;
      result.bytesOnDisk = onDisk;
      result.failedWhy = `counted ${written} bytes from the wire but ${onDisk} reached disk. Reported as a FAILED non-event rather than a success, because a snapshot nobody can open is not a snapshot.`;
      try { fs.rmSync(outFile, { force: true }); } catch { /* nothing further */ }
      result.file = null;
    } else {
      result.ok = true;
      result.file = outFile;
      result.bytes = onDisk;
      result.mb = +(onDisk / MB).toFixed(1);
    }
  } catch (err) {
    // Includes the tab dying mid-snapshot, which is an expected outcome on a 1.5 GB renderer.
    result.ok = false;
    result.failedWhy = result.failedWhy || `${String(err).slice(0, 200)}. A renderer of this size can OOM taking its own snapshot; that is a by-product failing, not a soak failing.`;
    try { if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true }); } catch { /* nothing further to do */ }
    result.file = null;
  } finally {
    result.elapsedMs = Date.now() - started;
    try { await session?.detach(); } catch { /* session already gone */ }
  }
  return result;
}
