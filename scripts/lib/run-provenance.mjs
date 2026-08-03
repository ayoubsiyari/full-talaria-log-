/**
 * What surface a measurement actually ran against.
 *
 * The b124 artifact was retired because the served engine came from one commit
 * and the dist-v9 bundle from another, and nothing in the artifact could show
 * that — engine markers were present in both halves. Markers prove the code is
 * the right shape; they do not prove the two halves came from the same tree.
 *
 * This lives in one place because a second hand-rolled copy is how the two
 * definitions drift apart, and a provenance block that disagrees with the guard
 * is worse than none: it certifies a surface nobody checked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import {
  REPO_ROOT,
  offendingEntries,
  parsePorcelainZ,
  readStatus,
} from '../clean-build-tree-guard.mjs';

function readStamp(file, re) {
  try {
    const m = re.exec(fs.readFileSync(file, 'utf8'));
    return m ? m[1] : null;
  } catch { return null; }
}

export function captureProvenance(distIndex = null) {
  const git = (args, fallback = null) => {
    try {
      return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    } catch { return fallback; }
  };
  // Reuse CLEAN-TREE-01's own definition of a build input rather than inventing
  // a second one. A broader hand-rolled glob flags test files and harness edits
  // that cannot change the emitted bytes, which would make this refuse runs the
  // guard considers reproducible — two definitions of "governed" is the defect,
  // not a safety margin.
  let dirtyGoverned = [];
  let governedBy = 'clean-build-tree-guard';
  try {
    dirtyGoverned = offendingEntries(parsePorcelainZ(readStatus())).map((e) => `${e.xy} ${e.path}`);
  } catch (error) {
    governedBy = `UNAVAILABLE: ${String((error && error.message) || error).slice(0, 120)}`;
  }
  return {
    headSha: git(['rev-parse', '--short', 'HEAD']),
    headSubject: git(['log', '-1', '--format=%s']),
    // Empty means every byte the build can compile is committed, so the artifact
    // is reproducible from headSha. Non-empty is the b124 failure mode.
    dirtyGovernedPaths: dirtyGoverned,
    governedBy,
    buildIdOnDisk: readStamp(path.join(REPO_ROOT, 'chart v 1.4/chart/index.html'),
      /__TALARIA_CHART_BUILD_ID='([^']+)'/),
    distV9BuildIdOnDisk: distIndex ? readStamp(distIndex, /__TALARIA_CHART_BUILD_ID='([^']+)'/) : null,
    swVersionOnDisk: readStamp(path.join(REPO_ROOT, 'chart v 1.4/chart/sw.js'),
      /SW_VERSION\s*=\s*"([^"]+)"/),
    distV9Mtime: (() => {
      try { return distIndex ? fs.statSync(distIndex).mtime.toISOString() : null; } catch { return null; }
    })(),
  };
}
