import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { HOMEPAGE_FORWARDING_CONTRACTS } from '../lib/homepage-forwarding-contracts.mjs';
import { syncHomepageModules } from '../../chart v 1.4/talaria-design/scripts/sync-homepage-modules.mjs';

const Q6 = 'modules/m20-q6-replay-lifecycle-binding.test.mjs';

function fixture(wrapper = HOMEPAGE_FORWARDING_CONTRACTS[Q6]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'talaria-homepage-sync-'));
  const src = path.join(root, 'canonical');
  const dest = path.join(root, 'homepage');
  fs.mkdirSync(src, { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(src, path.basename(Q6)), 'canonical full harness\n');
  fs.writeFileSync(path.join(src, 'ordinary.mjs'), 'canonical ordinary\n');
  fs.writeFileSync(path.join(dest, path.basename(Q6)), wrapper);
  fs.writeFileSync(path.join(dest, 'ordinary.mjs'), 'drifted ordinary\n');
  return { root, src, dest };
}

test('homepage module sync preserves exact forwarding contract and corrects ordinary drift', () => {
  const tree = fixture();
  try {
    syncHomepageModules(tree.src, tree.dest);
    assert.equal(
      fs.readFileSync(path.join(tree.dest, path.basename(Q6)), 'utf8'),
      HOMEPAGE_FORWARDING_CONTRACTS[Q6],
    );
    assert.equal(fs.readFileSync(path.join(tree.dest, 'ordinary.mjs'), 'utf8'), 'canonical ordinary\n');
  } finally {
    fs.rmSync(tree.root, { recursive: true, force: true });
  }
});

test('homepage module sync fails closed on a wrong forwarding wrapper', () => {
  const tree = fixture('// wrong wrapper\n');
  try {
    assert.throws(
      () => syncHomepageModules(tree.src, tree.dest),
      /forwarding contract wrapper mismatch/,
    );
    assert.equal(fs.readFileSync(path.join(tree.dest, 'ordinary.mjs'), 'utf8'), 'drifted ordinary\n');
  } finally {
    fs.rmSync(tree.root, { recursive: true, force: true });
  }
});
