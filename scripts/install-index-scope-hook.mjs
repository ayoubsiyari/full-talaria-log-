/**
 * Installs the INDEX-SCOPE-01 pre-commit hook into this clone.
 *
 * Deliberately opt-in rather than committed as core.hooksPath. Every lane in
 * this repo shares one working tree and we are hours from a seal; silently
 * placing a blocking hook in front of another lane's commit is the same
 * unilateral move as editing their board. Install, announce, let them adopt.
 *
 *   node scripts/install-index-scope-hook.mjs            # install
 *   node scripts/install-index-scope-hook.mjs --status
 *   node scripts/install-index-scope-hook.mjs --uninstall
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { gitDirOf } from './index-scope-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(__dirname, 'hooks', 'pre-commit');
const log = (m) => console.log(`[index-scope-hook] ${m}`);

const MARKER = 'INDEX-SCOPE-01 pre-commit hook';

function main() {
  const argv = process.argv.slice(2);
  const target = path.join(gitDirOf(REPO_ROOT), 'hooks', 'pre-commit');
  const exists = fs.existsSync(target);
  const current = exists ? fs.readFileSync(target, 'utf8') : '';
  const mine = current.includes(MARKER);

  if (argv.includes('--status')) {
    log(exists ? (mine ? `INSTALLED — ${target}` : `FOREIGN_HOOK_PRESENT — ${target} exists and is not ours`) : 'NOT_INSTALLED');
    return;
  }
  if (argv.includes('--uninstall')) {
    if (!exists) { log('NOT_INSTALLED'); return; }
    if (!mine) { log('REFUSED_FOREIGN_HOOK — a pre-commit hook exists that is not ours; not removing it'); process.exitCode = 3; return; }
    fs.unlinkSync(target);
    log('UNINSTALLED');
    return;
  }

  if (exists && !mine) {
    log(`REFUSED_FOREIGN_HOOK — ${target} already exists and is not ours.`);
    log('Chain it by hand rather than letting this overwrite someone else\'s hook.');
    process.exitCode = 3;
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(SOURCE, target);
  try { fs.chmodSync(target, 0o755); } catch { /* windows */ }
  log(`INSTALLED — ${target}`);
  log('Bypass for one commit: INDEX_SCOPE_OFF=1 git commit ...');
}

main();
