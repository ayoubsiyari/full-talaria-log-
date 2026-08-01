import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SUPPORT_WS_PING_CLEANUP_SWITCH,
  supportWsPingCleanupV1Enabled,
  supportWsPingTick,
} from './support-ws-ping-cleanup.mjs';

test('FLAG-01: absent / false / undefined keep cleanup ON; true disables', () => {
  const root = {};
  assert.equal(supportWsPingCleanupV1Enabled(root), true);
  root[SUPPORT_WS_PING_CLEANUP_SWITCH] = false;
  assert.equal(supportWsPingCleanupV1Enabled(root), true);
  root[SUPPORT_WS_PING_CLEANUP_SWITCH] = undefined;
  assert.equal(supportWsPingCleanupV1Enabled(root), true);
  root[SUPPORT_WS_PING_CLEANUP_SWITCH] = true;
  assert.equal(supportWsPingCleanupV1Enabled(root), false);
  delete root[SUPPORT_WS_PING_CLEANUP_SWITCH];
  assert.equal(supportWsPingCleanupV1Enabled(root), true);
});

test('FLAG-02: four-state round-trip without reload (per-call truthiness)', () => {
  const root = {};
  const sequence = [];
  const closed = { readyState: 3, send() { sequence.push('send'); } };
  let cleared = 0;
  const clearPing = () => { cleared += 1; };

  assert.equal(supportWsPingTick(closed, clearPing, root), 'cleared');
  root[SUPPORT_WS_PING_CLEANUP_SWITCH] = true;
  // Legacy path still attempts send (spam source) — no readyState guard.
  assert.equal(supportWsPingTick(closed, clearPing, root), 'legacy-sent');
  root[SUPPORT_WS_PING_CLEANUP_SWITCH] = false;
  assert.equal(supportWsPingTick(closed, clearPing, root), 'cleared');
  delete root[SUPPORT_WS_PING_CLEANUP_SWITCH];
  assert.equal(supportWsPingTick(closed, clearPing, root), 'cleared');
  assert.ok(cleared >= 3);
  assert.ok(sequence.includes('send'));
});

test('OPEN socket sends; CLOSED clears instead of send', () => {
  const root = {};
  let sent = 0;
  let cleared = 0;
  const open = { readyState: 1, send() { sent += 1; } };
  const closed = { readyState: 3, send() { sent += 1; } };
  assert.equal(supportWsPingTick(open, () => { cleared += 1; }, root), 'sent');
  assert.equal(sent, 1);
  assert.equal(supportWsPingTick(closed, () => { cleared += 1; }, root), 'cleared');
  assert.equal(sent, 1);
  assert.equal(cleared, 1);
});
