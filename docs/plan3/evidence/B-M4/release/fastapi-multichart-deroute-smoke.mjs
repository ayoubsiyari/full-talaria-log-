#!/usr/bin/env node
/**
 * Local artifact proof that api_server.py no longer mounts /chart/multichart
 * unless TALARIA_MOUNT_MULTICHART_SANDBOX=1. Does not replace host acceptance.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const api = path.join(REPO, 'chart v 1.4/chart/api_server.py');
const src = fs.readFileSync(api, 'utf8');

const hasOptIn = src.includes('TALARIA_MOUNT_MULTICHART_SANDBOX');
const mountsOnlyIfOptIn =
  /_MOUNT_MULTICHART_SANDBOX[\s\S]{0,200}if _MOUNT_MULTICHART_SANDBOX and _MULTICHART_DIR_PATH\.is_dir\(\):/.test(
    src,
  );
const bareDirMountGone = !/if _MULTICHART_DIR_PATH\.is_dir\(\):\s*\n\s*app\.mount\("\/chart\/multichart"/.test(
  src,
);

const mountIdx = src.indexOf('app.mount("/chart/multichart"');
const window = mountIdx >= 0 ? src.slice(Math.max(0, mountIdx - 400), mountIdx) : '';
const mountGatedInWindow = window.includes('_MOUNT_MULTICHART_SANDBOX');

const report = {
  observedAt: new Date().toISOString(),
  apiPath: api,
  hasOptIn,
  mountsOnlyIfOptIn,
  bareDirMountGone,
  mountGatedInWindow,
  pass: hasOptIn && mountsOnlyIfOptIn && bareDirMountGone && mountGatedInWindow,
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.pass ? 0 : 2;
