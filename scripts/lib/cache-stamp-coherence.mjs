/**
 * CACHE-STAMP-COHERENCE-V1
 * Signature: TALARIA_CACHE_STAMP_COHERENCE_V1
 *
 * Terminal observables (ORACLE-01):
 *  1. Cross-shell stamp coherence — shells that share /chart/modules/* URLs must agree
 *     on each module's ?v= stamp (dist b83 vs legacy/embed b80 is RED).
 *  2. Content-hash vs stamp baseline — if a served module's bytes change while its
 *     stamped ?v= stays the same as the last sealed baseline, the build is RED
 *     (correct container, warm cache still serves the old module).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TALARIA_CACHE_STAMP_COHERENCE_V1 = 'TALARIA_CACHE_STAMP_COHERENCE_V1';
export const CACHE_STAMP_COHERENCE_GATE_NAME = 'CACHE-STAMP-COHERENCE-V1';

export const CACHE_STAMP_BASELINE_RELATIVE = 'scripts/cache-stamp-module-baseline.json';

/** Production shells that share stamped chart module URLs. */
export const CACHE_STAMP_SHELLS = [
  {
    id: 'dist-v9-canonical',
    relativePath: 'chart v 1.4/chart/dist-v9/index.html',
    role: 'dist',
  },
  {
    id: 'dist-v9-homepage',
    relativePath: 'homepage/public/chart/dist-v9/index.html',
    role: 'dist',
  },
  {
    id: 'live-source',
    relativePath: 'chart v 1.4/talaria-design/live/index.html',
    role: 'live',
  },
  {
    id: 'legacy-canonical',
    relativePath: 'chart v 1.4/chart/legacy-index.html',
    role: 'legacy',
  },
  {
    id: 'embed-canonical',
    relativePath: 'chart v 1.4/chart/multichart-prod/chart-embed.html',
    role: 'embed',
  },
  {
    id: 'embed-homepage',
    relativePath: 'homepage/public/chart/multichart-prod/chart-embed.html',
    role: 'embed',
  },
];

const MODULE_REF_RE = /(?:\/chart\/|["'(]|\s)((?:modules\/)[^"'?\s]+\.js)\?v=([^"'&#\s]+)/g;
const BUILD_ID_RES = [
  /window\.__TALARIA_CHART_BUILD_ID\s*=\s*['"]([^'"]+)['"]/,
  /window\.__TALARIA_CHART_BUILD_ID\s*=\s*p\.get\('v'\)\s*\|\|\s*'([^']+)'/,
  /const CHART_ENGINE_BUILD = '([^']+)'/,
];

function cellResult(cell, pass, detail, coverage = 'soundness') {
  return {
    cell,
    coverage,
    ver: 'VER-01',
    status: pass ? 'GREEN' : 'RED',
    pass,
    ...detail,
    signature: TALARIA_CACHE_STAMP_COHERENCE_V1,
  };
}

function redCell(cell, reason, coverage = 'soundness') {
  return cellResult(cell, false, { reason }, coverage);
}

export function normalizeLineEndings(source) {
  return typeof source === 'string' ? source.replace(/\r\n/g, '\n') : source;
}

export function sha256Text(text) {
  return crypto.createHash('sha256').update(normalizeLineEndings(text), 'utf8').digest('hex');
}

export function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Extract stamped module refs from a shell HTML/JS source.
 * Normalized module key: `modules/<path>.js` (chart-root relative).
 */
export function extractStampedModuleRefs(source) {
  const refs = [];
  const text = normalizeLineEndings(source);
  for (const match of text.matchAll(MODULE_REF_RE)) {
    const modulePath = match[1].replace(/^\/+/, '');
    const stamp = match[2];
    if (!modulePath.startsWith('modules/')) continue;
    refs.push({ modulePath, stamp });
  }
  return refs;
}

export function extractShellBuildIds(source) {
  const text = normalizeLineEndings(source);
  const ids = [];
  for (const re of BUILD_ID_RES) {
    const m = text.match(re);
    if (m?.[1]) ids.push(m[1]);
  }
  for (const match of text.matchAll(/[?&]v=([^"'&#\s]+)/g)) {
    ids.push(match[1]);
  }
  return [...new Set(ids)];
}

function resolveModuleFile(root, modulePath) {
  const candidates = [
    path.join(root, 'chart v 1.4', 'chart', modulePath),
    path.join(root, 'homepage', 'public', 'chart', modulePath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadBaseline(root, relativePath = CACHE_STAMP_BASELINE_RELATIVE) {
  const abs = path.join(root, relativePath);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

export function buildBaselineFromTree(root, shells = CACHE_STAMP_SHELLS) {
  const modules = {};
  const shellStamps = {};
  for (const shell of shells) {
    const abs = path.join(root, shell.relativePath);
    if (!fs.existsSync(abs)) continue;
    const source = fs.readFileSync(abs, 'utf8');
    const buildIds = extractShellBuildIds(source);
    shellStamps[shell.id] = buildIds;
    for (const ref of extractStampedModuleRefs(source)) {
      const file = resolveModuleFile(root, ref.modulePath);
      if (!file) continue;
      const hash = sha256File(file);
      const prev = modules[ref.modulePath];
      if (!prev) {
        modules[ref.modulePath] = { stamp: ref.stamp, sha256: hash };
      } else if (prev.stamp !== ref.stamp) {
        modules[ref.modulePath] = {
          stamp: ref.stamp,
          sha256: hash,
          conflict: true,
          stamps: [...new Set([prev.stamp, ref.stamp])],
        };
      }
    }
  }
  return {
    schema: 'talaria.cache-stamp-module-baseline.v1',
    signature: TALARIA_CACHE_STAMP_COHERENCE_V1,
    generatedAt: new Date().toISOString(),
    modules,
    shellStamps,
  };
}

export function writeBaseline(root, baseline, relativePath = CACHE_STAMP_BASELINE_RELATIVE) {
  const abs = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  return abs;
}

/**
 * Collect per-shell stamped module observations.
 */
export function observeShellModuleStamps(root, shells = CACHE_STAMP_SHELLS) {
  const observations = [];
  for (const shell of shells) {
    const abs = path.join(root, shell.relativePath);
    if (!fs.existsSync(abs)) {
      observations.push({
        shellId: shell.id,
        relativePath: shell.relativePath,
        role: shell.role,
        readable: false,
        refs: [],
        buildIds: [],
      });
      continue;
    }
    const source = fs.readFileSync(abs, 'utf8');
    observations.push({
      shellId: shell.id,
      relativePath: shell.relativePath,
      role: shell.role,
      readable: true,
      refs: extractStampedModuleRefs(source),
      buildIds: extractShellBuildIds(source),
    });
  }
  return observations;
}

/** Same module path must carry one stamp across all readable shells that reference it. */
export function runCrossShellStampCoherenceCell(root, shells = CACHE_STAMP_SHELLS) {
  const cell = 'CROSS-SHELL-MODULE-STAMP-COHERENCE';
  try {
    const observations = observeShellModuleStamps(root, shells);
    const byModule = new Map();
    for (const obs of observations) {
      if (!obs.readable) continue;
      for (const ref of obs.refs) {
        const entry = byModule.get(ref.modulePath) ?? [];
        entry.push({ shellId: obs.shellId, role: obs.role, stamp: ref.stamp });
        byModule.set(ref.modulePath, entry);
      }
    }
    const conflicts = [];
    for (const [modulePath, entries] of byModule) {
      const stamps = [...new Set(entries.map((e) => e.stamp))];
      if (stamps.length > 1) {
        conflicts.push({
          modulePath,
          stamps,
          shells: entries.map((e) => `${e.shellId}:${e.stamp}`),
        });
      }
    }
    const sharedModuleCount = [...byModule.values()].filter((e) => e.length >= 2).length;
    const pass = conflicts.length === 0
      && observations.every((o) => o.readable)
      && sharedModuleCount > 0;
    return cellResult(cell, pass, {
      sharedModuleCount,
      conflictCount: conflicts.length,
      conflicts,
      shellCount: observations.length,
    });
  } catch (error) {
    return redCell(cell, String(error?.message ?? error));
  }
}

/**
 * Baseline coherence: stamp unchanged ⇒ content hash must match the sealed baseline.
 * Stamp advanced ⇒ hash may change (new seal); still recorded for the report.
 */
export function runModuleContentStampBaselineCell(
  root,
  {
    shells = CACHE_STAMP_SHELLS,
    baseline = loadBaseline(root),
  } = {},
) {
  const cell = 'MODULE-CONTENT-STAMP-BASELINE';
  try {
    if (!baseline?.modules || typeof baseline.modules !== 'object') {
      return redCell(cell, `${CACHE_STAMP_BASELINE_RELATIVE} missing or unreadable — cannot prove stamp/content coherence`);
    }
    const observations = observeShellModuleStamps(root, shells);
    const seen = new Map();
    for (const obs of observations) {
      if (!obs.readable) continue;
      for (const ref of obs.refs) {
        if (!seen.has(ref.modulePath)) seen.set(ref.modulePath, ref.stamp);
        else if (seen.get(ref.modulePath) !== ref.stamp) {
          // Cross-shell conflict is another cell; still note for baseline.
          seen.set(ref.modulePath, ref.stamp);
        }
      }
    }
    const drifts = [];
    const stampMismatches = [];
    const missingFiles = [];
    const unknownModules = [];
    for (const [modulePath, stamp] of seen) {
      const file = resolveModuleFile(root, modulePath);
      if (!file) {
        missingFiles.push(modulePath);
        continue;
      }
      const hash = sha256File(file);
      const prior = baseline.modules[modulePath];
      if (!prior) {
        unknownModules.push(modulePath);
        continue;
      }
      // R-W55: a stamp bump without --write-baseline must RED. Otherwise the hash
      // comparison is skipped forever under the new stamp and content drift goes silent.
      if (prior.stamp !== stamp) {
        stampMismatches.push({
          modulePath,
          baselineStamp: prior.stamp,
          observedStamp: stamp,
          reason: 'baseline stamp does not match shell ?v= — re-seal with --write-baseline',
        });
        continue;
      }
      if (prior.sha256 !== hash) {
        drifts.push({
          modulePath,
          stamp,
          baselineSha256: prior.sha256,
          currentSha256: hash,
          reason: 'content changed while ?v= stamp stayed sealed',
        });
      }
    }
    const pass = drifts.length === 0
      && stampMismatches.length === 0
      && missingFiles.length === 0
      && unknownModules.length === 0
      && seen.size > 0;
    return cellResult(cell, pass, {
      modulesChecked: seen.size,
      driftCount: drifts.length,
      stampMismatchCount: stampMismatches.length,
      drifts,
      stampMismatches,
      missingFiles,
      unknownModules,
      baselinePath: CACHE_STAMP_BASELINE_RELATIVE,
    });
  } catch (error) {
    return redCell(cell, String(error?.message ?? error));
  }
}

/** Every readable shell must converge on a single build/stamp id family. */
export function runShellBuildIdUniformCell(root, shells = CACHE_STAMP_SHELLS) {
  const cell = 'SHELL-BUILD-ID-UNIFORM';
  try {
    const observations = observeShellModuleStamps(root, shells);
    const perShell = observations.map((obs) => ({
      shellId: obs.shellId,
      readable: obs.readable,
      uniqueIds: obs.readable ? [...new Set(obs.buildIds)] : [],
    }));
    const allIds = [...new Set(perShell.flatMap((s) => s.uniqueIds))];
    const mixedInside = perShell.filter((s) => s.readable && s.uniqueIds.length > 1);
    const pass = allIds.length === 1
      && mixedInside.length === 0
      && perShell.every((s) => s.readable && s.uniqueIds.length === 1);
    return cellResult(cell, pass, {
      buildId: allIds.length === 1 ? allIds[0] : null,
      allIds,
      mixedInside,
      perShell,
    });
  } catch (error) {
    return redCell(cell, String(error?.message ?? error));
  }
}

/**
 * Negative control: sealed stamp matches shells, but baseline hash is stale relative
 * to the bytes on disk — the MODULE-CONTENT-STAMP-BASELINE cell must go RED.
 * (Models "file edited, ?v= not bumped".)
 */
export function runNcStaleStampContentDriftCell(root, {
  shells = CACHE_STAMP_SHELLS,
  baseline = loadBaseline(root),
  modulePath = 'modules/order-manager.js',
} = {}) {
  const cell = 'NC-STALE-STAMP-CONTENT-DRIFT';
  try {
    const file = resolveModuleFile(root, modulePath);
    if (!file || !baseline?.modules?.[modulePath]) {
      return redCell(cell, `cannot aim NC at ${modulePath}`);
    }
    const currentHash = sha256File(file);
    const distPath = path.join(root, 'chart v 1.4/chart/dist-v9/index.html');
    const shellStamp = extractStampedModuleRefs(fs.readFileSync(distPath, 'utf8'))
      .find((r) => r.modulePath === modulePath)?.stamp
      ?? baseline.modules[modulePath].stamp;
    const staleHash = currentHash === '0'.repeat(64) ? 'f'.repeat(64) : '0'.repeat(64);
    const driftedBaseline = {
      ...baseline,
      modules: {
        ...baseline.modules,
        [modulePath]: { stamp: shellStamp, sha256: staleHash },
      },
    };
    const baselineCell = runModuleContentStampBaselineCell(root, {
      shells,
      baseline: driftedBaseline,
    });
    const driftHit = (baselineCell.drifts ?? []).some((d) => d.modulePath === modulePath);
    const pass = baselineCell.pass === false && driftHit;
    return cellResult(cell, pass, {
      modulePath,
      detectorWentRed: baselineCell.pass === false,
      driftHit,
      drifts: baselineCell.drifts,
    }, 'wiring');
  } catch (error) {
    return redCell(cell, String(error?.message ?? error), 'wiring');
  }
}

export function runCacheStampCoherenceGate(opts = {}) {
  const root = opts.root ?? process.cwd();
  const shells = opts.shells ?? CACHE_STAMP_SHELLS;
  const baseline = opts.baseline ?? loadBaseline(root);
  const cells = [
    runShellBuildIdUniformCell(root, shells),
    runCrossShellStampCoherenceCell(root, shells),
    runModuleContentStampBaselineCell(root, { shells, baseline }),
    runNcStaleStampContentDriftCell(root, { shells, baseline }),
  ];
  const blocking = cells.filter((c) => typeof c.pass === 'boolean' && c.blocking !== false);
  const allPass = blocking.every((c) => c.pass === true);
  return {
    gate: CACHE_STAMP_COHERENCE_GATE_NAME,
    signature: TALARIA_CACHE_STAMP_COHERENCE_V1,
    coverage: 'mixed',
    ver: 'VER-01',
    cells,
    allPass,
    ok: allPass,
    status: allPass ? 'GREEN' : 'RED',
  };
}

export function formatCacheStampCoherenceReport(report) {
  const lines = [
    report.signature,
    `gate=${report.gate}`,
    `coverage=${report.coverage} (${report.ver})`,
    '',
  ];
  for (const c of report.cells) {
    lines.push(`${c.cell} [${c.coverage}]: ${c.status}`);
    if (c.reason) lines.push(`    ${c.reason}`);
    if (c.conflictCount) lines.push(`    conflicts: ${c.conflictCount}`);
    if (c.driftCount) lines.push(`    drifts: ${c.driftCount}`);
    if (c.stampMismatchCount) lines.push(`    stamp mismatches: ${c.stampMismatchCount}`);
    if (Array.isArray(c.stampMismatches) && c.stampMismatches.length) {
      for (const m of c.stampMismatches.slice(0, 5)) {
        lines.push(`    - ${m.modulePath} baseline=${m.baselineStamp} observed=${m.observedStamp}`);
      }
    }
    if (Array.isArray(c.drifts) && c.drifts.length) {
      for (const d of c.drifts.slice(0, 5)) {
        lines.push(`    - ${d.modulePath} stamp=${d.stamp}`);
      }
    }
  }
  lines.push('');
  lines.push(`Summary: ${report.allPass ? 'GREEN' : 'RED'}`);
  return lines.join('\n');
}
