/**
 * DETACH-01 primitives: a crash costs one sample, not a run.
 *
 * Tonight cost five hours twice. Both losses had the same shape: the run held its results in memory and in a
 * process tree an editor could reach, so when the editor went down the measurement went with it. The three
 * requirements are append-as-taken, heartbeat, and auto-resume, and they only work together - an append-only
 * log with no heartbeat cannot tell a finished run from a dead one, and a heartbeat with no resume just
 * reports the death faster.
 *
 * Usage:
 *   const run = openRun({ name: 'my-soak', out: 'X.jsonl' });   // resumes if the file exists
 *   run.append({ ... });                                        // fsync'd JSONL line + heartbeat
 *   run.finish({ ... });
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Launch a script fully detached from this process tree, so no IDE crash can cascade into it.
 * On Windows the parent becomes WmiPrvSE; a plain spawn (even `detached: true`) stays in the console's job
 * and dies with it, which is exactly how measurement time was lost twice tonight.
 */
export function launchDetached(scriptRelPath, args = [], { cwd = process.cwd(), logFile = null, heapCapMB = 1024 } = {}) {
  const node = process.execPath;
  const quoted = [scriptRelPath, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
  const redirect = logFile ? ` > "${logFile}" 2>&1` : '';
  // TOOL-01: the cap is applied HERE rather than left to each launch site, because "every long-running
  // harness process" is a rule that fails the moment one call site forgets. The launched process asserts
  // the limit V8 actually applied, so a cap that is passed but inert is loud rather than silent.
  const capFlag = heapCapMB ? `--max-old-space-size=${heapCapMB} ` : '';
  const command = `cmd.exe /c cd /d "${cwd}" && "${node}" ${capFlag}${quoted}${redirect}`;

  // The command contains double quotes (paths with spaces) and a redirect. Interpolating it into a
  // -Command string with JSON.stringify produces backslash-escaped quotes, which PowerShell does NOT
  // understand as escapes - it uses backtick or doubled quotes - so the string terminates early and the
  // call fails. -EncodedCommand takes base64 UTF-16LE and has no quoting surface at all.
  //
  // This is why the primitive silently never worked: every detached run so far was launched by a
  // hand-rolled WMI call typed at the shell, and the self-test covered append/heartbeat/resume but never
  // launchDetached itself. Present, not bound, in the one function the crash-survival story rests on.
  const psSource = `$ErrorActionPreference='Stop'
$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = @'
${command}
'@ }
Write-Output "$($r.ReturnValue) $($r.ProcessId)"`;
  const encoded = Buffer.from(psSource, 'utf16le').toString('base64');
  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { encoding: 'utf8' });
  const [rv, pid] = String(res.stdout || '').trim().split(/\s+/);
  const ok = rv === '0';
  return {
    ok,
    launcherPid: Number(pid) || null,
    command,
    // A launcher that fails silently is how a ten-hour run becomes an empty file, so the reason travels.
    error: ok ? null : `Win32_Process.Create returned ${rv || '(no output)'}; stderr: ${String(res.stderr || '').trim().slice(0, 300)}`,
  };
}

/**
 * Open (or resume) an append-only run.
 *
 * The samples file is JSONL because a partially written JSON object is unreadable while a partially written
 * JSONL file loses only its last line - which is the whole point when the failure mode is a hard kill.
 */
export function openRun({ name, out, meta = {} }) {
  const dir = path.dirname(out);
  fs.mkdirSync(dir, { recursive: true });
  const heartbeatPath = out.replace(/\.jsonl?$/i, '') + '.heartbeat.json';

  let resumed = [];
  if (fs.existsSync(out)) {
    const lines = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean);
    for (const l of lines) {
      // A hard kill can truncate the final line. Skip it rather than throwing away the whole run.
      try { resumed.push(JSON.parse(l)); } catch { /* torn final line */ }
    }
  }
  const torn = fs.existsSync(out)
    ? fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).length - resumed.length
    : 0;

  // A hard kill leaves the file without a trailing newline, and appending to that CONCATENATES the first new
  // record onto the torn fragment - so the resume silently destroys its own first line, which is the segment
  // boundary. Truncate back to the last complete line before reopening. Caught by the self-test, not in
  // production, and only because the test simulated the exact failure the primitive exists for.
  if (fs.existsSync(out)) {
    const raw = fs.readFileSync(out, 'utf8');
    if (raw.length && !raw.endsWith('\n')) {
      const keep = raw.lastIndexOf('\n');
      fs.truncateSync(out, keep >= 0 ? keep + 1 : 0);
    }
  }

  const fd = fs.openSync(out, 'a');
  let n = resumed.length;
  const startedAt = Date.now();

  const writeHeartbeat = (extra = {}) => {
    const hb = {
      name,
      pid: process.pid,
      alive: true,
      samples: n,
      resumedFrom: resumed.length,
      lastSampleAt: new Date().toISOString(),
      startedAt: new Date(startedAt).toISOString(),
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      ...extra,
    };
    // Write-then-rename so a reader never sees a half-written heartbeat.
    const tmp = heartbeatPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(hb, null, 1));
    fs.renameSync(tmp, heartbeatPath);
  };

  if (Object.keys(meta).length && resumed.length === 0) {
    const line = JSON.stringify({ __meta: true, name, at: new Date().toISOString(), ...meta }) + '\n';
    fs.writeSync(fd, line);
    fs.fsyncSync(fd);
  }
  writeHeartbeat({ phase: 'opened' });

  return {
    resumedSamples: resumed.filter((r) => !r.__meta),
    tornLinesSkipped: torn,
    heartbeatPath,
    append(sample) {
      n += 1;
      fs.writeSync(fd, JSON.stringify({ n, at: new Date().toISOString(), ...sample }) + '\n');
      // fsync, not just write: a buffered line is a lost line when the kill is hard.
      fs.fsyncSync(fd);
      writeHeartbeat({ phase: 'running' });
      return n;
    },
    note(obj) {
      fs.writeSync(fd, JSON.stringify({ __note: true, at: new Date().toISOString(), ...obj }) + '\n');
      fs.fsyncSync(fd);
    },
    finish(summary = {}) {
      fs.writeSync(fd, JSON.stringify({ __final: true, at: new Date().toISOString(), samples: n, ...summary }) + '\n');
      fs.fsyncSync(fd);
      try { fs.closeSync(fd); } catch { /* already closed */ }
      const tmp = heartbeatPath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ name, pid: process.pid, alive: false, completed: true, samples: n, finishedAt: new Date().toISOString() }, null, 1));
      fs.renameSync(tmp, heartbeatPath);
    },
  };
}

/** Is a run alive, finished, or dead? Reads only the heartbeat, so it works from any process. */
export function inspectRun(out, { staleSec = 600 } = {}) {
  const heartbeatPath = out.replace(/\.jsonl?$/i, '') + '.heartbeat.json';
  if (!fs.existsSync(heartbeatPath)) return { state: 'NEVER STARTED' };
  const hb = JSON.parse(fs.readFileSync(heartbeatPath, 'utf8'));
  if (hb.completed) return { state: 'COMPLETED', ...hb };
  const ageSec = (Date.now() - new Date(hb.lastSampleAt).getTime()) / 1000;
  return {
    state: ageSec > staleSec ? 'DEAD OR STALLED' : 'ALIVE',
    staleForSec: Math.round(ageSec),
    ...hb,
  };
}
