// Append-only enforcement for the four manager journals (A11.2 item 1).
//
// The rule is a true byte-prefix rule: the committed journal content at the head of
// a packet must begin with the exact bytes it had at the packet's base. That is
// stronger than scanning a diff for `-` lines, because it also rejects insertion
// in the middle, reordering, and a rewrite that happens to preserve line count.
// Deleting or renaming a journal is RED, and only the journal's owner may append
// to it.
//
// BYTES, NOT CHARACTERS. Comparison happens on Buffers and never on a decoded
// string. Decoding first would map every invalid byte sequence onto U+FFFD, so
// swapping one 0xFF for one 0xFE inside an existing line - a silent edit of history
// - would compare equal and the packet would go GREEN. Strings are still accepted
// here (they are the natural shape for unit cells) and are encoded as UTF-8 before
// the comparison; callers that read blobs from git must hand over Buffers, and
// scripts/territory-preflight.mjs asserts that its git runner does.

import assert from 'node:assert/strict';

export const SIGNATURE = 'TALARIA_JOURNAL_APPEND_ONLY_V1';

const STATUSES = ['A', 'M', 'D', 'R', 'C', 'T'];
const NEWLINE = 0x0a;

export function journalBytes(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  return null;
}

export function isAppendOnly(before, after) {
  const base = journalBytes(before);
  const head = journalBytes(after);
  if (base === null || head === null) return false;
  if (head.length < base.length) return false;
  if (!head.subarray(0, base.length).equals(base)) return false;
  if (head.length === base.length) return true;
  // The base's final line must still be a whole line in the head, otherwise the
  // append extended an existing line rather than adding a new one.
  return base.length === 0 || base[base.length - 1] === NEWLINE || head[base.length] === NEWLINE;
}

export function appendedLines(before, after) {
  if (!isAppendOnly(before, after)) return [];
  const base = journalBytes(before);
  const head = journalBytes(after);
  if (head.length === base.length) return [];
  const tail = head[base.length] === NEWLINE ? head.subarray(base.length + 1) : head.subarray(base.length);
  // The prefix comparison above already ran on bytes; this decode only shapes the
  // appended tail for reporting and counting.
  return tail.toString('utf8').split('\n').filter((line) => line.length > 0);
}

export function auditJournalAppendOnly({ journals, changes, author }) {
  assert.ok(Array.isArray(journals) && journals.length, 'journal audit: no journals declared');
  assert.ok(Array.isArray(changes), 'journal audit: changes must be a list');
  const owners = new Map(journals.map((entry) => [entry.path, entry.owner]));
  const violations = [];
  const checked = [];

  for (const change of changes) {
    assert.ok(STATUSES.includes(change.status), `journal audit: unknown change status ${change.status}`);
    const path = change.path;
    const previousPath = change.previousPath || null;
    const touchesJournal = owners.has(path) || (previousPath !== null && owners.has(previousPath));
    if (!touchesJournal) continue;

    const journalPath = owners.has(path) ? path : previousPath;
    const owner = owners.get(journalPath);
    const record = { path: journalPath, owner, status: change.status, appended: 0 };
    const baseUnreadable = change.beforeUnreadable === true && change.status !== 'A';
    const headUnreadable = change.afterUnreadable === true && change.status !== 'D';

    if (author !== undefined && author !== owner) {
      violations.push({ path: journalPath, kind: 'journal-owner', detail: `Manager ${author} may not write Manager ${owner}'s journal` });
    }
    if (baseUnreadable) {
      violations.push({ path: journalPath, kind: 'journal-base-unreadable', detail: 'modified journal base bytes could not be read from the parent commit' });
    }
    if (headUnreadable) {
      violations.push({ path: journalPath, kind: 'journal-head-unreadable', detail: 'journal bytes could not be read from the head commit' });
    }

    if (change.status === 'D') {
      violations.push({ path: journalPath, kind: 'journal-removed', detail: 'an append-only journal was deleted' });
    } else if (change.status === 'R' || change.status === 'C' || change.status === 'T') {
      violations.push({ path: journalPath, kind: 'journal-renamed', detail: `an append-only journal was ${change.status === 'R' ? 'renamed' : 'copied or retyped'} from ${previousPath}` });
    } else if (change.status === 'A') {
      const base = journalBytes(change.before);
      if (base !== null && base.length > 0) {
        violations.push({ path: journalPath, kind: 'journal-rewritten', detail: 'journal reported as added but content existed at base' });
      }
      record.appended = appendedLines('', change.after ?? '').length;
    } else if (!baseUnreadable && !headUnreadable) {
      const before = change.before ?? '';
      const after = change.after ?? '';
      if (!isAppendOnly(before, after)) {
        violations.push({ path: journalPath, kind: 'journal-not-append-only', detail: 'existing journal bytes were modified, removed, inserted before prior EOF, or reordered' });
      } else {
        record.appended = appendedLines(before, after).length;
      }
    }
    checked.push(record);
  }

  return {
    signature: SIGNATURE,
    author: author ?? null,
    ok: violations.length === 0,
    checked: checked.sort((a, b) => a.path.localeCompare(b.path)),
    violations: violations.sort((a, b) => `${a.path}${a.kind}`.localeCompare(`${b.path}${b.kind}`)),
  };
}
