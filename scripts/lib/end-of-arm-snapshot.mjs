/**
 * End-of-arm heap snapshot, taken AFTER the final sample so it perturbs nothing it measures.
 *
 * A ~1.5 GB renderer can write multiple GB of snapshot and can OOM the tab taking it. Every one of those
 * outcomes is acceptable at this point in the run and none of them may look like a lost soak, so:
 *
 *  - free disk is checked BEFORE the write and the attempt is skipped if headroom is thin,
 *  - the write is capped and aborted cleanly if it runs past the cap,
 *  - any failure is recorded as a logged NON-EVENT with its reason, and the arm still closes green,
 *  - failed/partial files are preserved with a `.failed` suffix plus a JSON sidecar, so
 *    "attempted and died" never collapses into "never started."
 *
 * The snapshot is a by-product. The series is the measurement.
 *
 * WRITE DISCIPLINE: do NOT end a write stream on reportHeapSnapshotProgress.finished. On this host that
 * event fires while chunks are still in flight; ending early produced "198 MB counted from the wire,
 * 0 bytes on disk" — the exact false-success class an earlier rewrite of this helper was meant to stop.
 * Chunks are appended synchronously; the take promise settles; a short settle waits for trailers; then
 * bytes on disk are verified against the wire count.
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
  phase = 'snapshotting',
} = {}) {
  const result = {
    attempted: false, ok: false, file: null, bytes: null, elapsedMs: null,
    skippedWhy: null, failedWhy: null,
    phase,
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
  const preserveFailed = () => {
    const failedFile = `${outFile}.failed`;
    const failedMetaFile = `${failedFile}.json`;
    try {
      if (fs.existsSync(outFile)) {
        fs.renameSync(outFile, failedFile);
        result.failedFile = failedFile;
      }
    } catch (err) {
      result.failedPreserveError = String(err?.message || err).slice(0, 200);
    }
    try {
      const preservedPath = result.failedFile || outFile;
      fs.writeFileSync(failedMetaFile, JSON.stringify({
        phase,
        at: new Date().toISOString(),
        outFile,
        failedFile: result.failedFile || null,
        failedWhy: result.failedWhy,
        skippedWhy: result.skippedWhy,
        bytesCounted: result.bytesCounted ?? written,
        bytesOnDisk: fs.existsSync(preservedPath) ? fs.statSync(preservedPath).size : 0,
        aborted,
      }, null, 2));
      result.failedMetaFile = failedMetaFile;
    } catch (err) {
      result.failedMetaError = String(err?.message || err).slice(0, 200);
    }
  };
  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, '');
    session = await page.target().createCDPSession();
    let progressFinished = false;
    const onChunk = (ev) => {
      if (aborted || !ev?.chunk) return;
      const n = Buffer.byteLength(ev.chunk, 'utf8');
      if (written + n > capMB * MB) {
        aborted = true;
        result.failedWhy = `write passed the ${capMB} MB cap and was aborted cleanly at ${((written + n) / MB).toFixed(0)} MB. A partial snapshot is preserved as .failed evidence rather than published as a valid snapshot.`;
        return;
      }
      fs.appendFileSync(outFile, ev.chunk);
      written += n;
    };
    session.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    session.on('HeapProfiler.reportHeapSnapshotProgress', (p) => {
      if (p?.finished) progressFinished = true;
    });

    await session.send('HeapProfiler.enable');
    await Promise.race([
      session.send('HeapProfiler.takeHeapSnapshot', { reportProgress: true, captureNumericValue: false }),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)),
    ]);
    for (let i = 0; i < 20 && !progressFinished; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 250));
    session.off('HeapProfiler.addHeapSnapshotChunk', onChunk);

    const onDisk = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0;
    if (aborted) {
      result.ok = false;
      result.file = null;
      result.bytesCounted = written;
      result.bytesOnDisk = onDisk;
      preserveFailed();
    } else if (written === 0 || onDisk === 0) {
      result.ok = false;
      result.bytesCounted = written;
      result.bytesOnDisk = onDisk;
      result.failedWhy = `takeHeapSnapshot produced wire=${written} disk=${onDisk}. Nothing usable to publish.`;
      preserveFailed();
      result.file = null;
    } else if (onDisk < written * 0.99) {
      result.ok = false;
      result.bytesCounted = written;
      result.bytesOnDisk = onDisk;
      result.failedWhy = `counted ${written} bytes from the wire but ${onDisk} reached disk. Reported as a FAILED non-event rather than a success, because a snapshot nobody can open is not a snapshot.`;
      preserveFailed();
      result.file = null;
    } else {
      result.ok = true;
      result.file = outFile;
      result.bytes = onDisk;
      result.mb = +(onDisk / MB).toFixed(1);
      result.progressFinished = progressFinished;
    }
  } catch (err) {
    // Includes the tab dying mid-snapshot, which is an expected outcome on a 1.5 GB renderer.
    result.ok = false;
    result.failedWhy = result.failedWhy || `${String(err).slice(0, 200)}. A renderer of this size can OOM taking its own snapshot; that is a by-product failing, not a soak failing.`;
    preserveFailed();
    result.file = null;
  } finally {
    result.elapsedMs = Date.now() - started;
    try { await session?.detach(); } catch { /* session already gone */ }
  }
  return result;
}
