// Append-only enforcement for the four manager journals (A11.2 item 1).
//
// The rule is mechanical: the committed journal content at the head of a packet must
// begin with the exact bytes it had at the packet's base. That is stronger than
// scanning a diff for `-` lines, because it also rejects insertion in the middle,
// reordering, and a rewrite that happens to preserve line count. Deleting or renaming
// a journal is RED, and only the journal's owner may append to it.

import assert from 'node:assert/strict';

export const SIGNATURE = 'TALARIA_JOURNAL_APPEND_ONLY_V1';

const STATUSES = ['A', 'M', 'D', 'R', 'C', 'T'];

export function isAppendOnly(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return false;
  if (after.length < before.length) return false;
  if (after.slice(0, before.length) !== before) return false;
  if (after.length === before.length) return true;
  // The base's final line must still be a whole line in the head, otherwise the
  // append extended an existing line rather than adding a new one.
  return before.length === 0 || before.endsWith('\n') || after[before.length] === '\n';
}

export function appendedLines(before, after) {
  if (!isAppendOnly(before, after) || after.length === before.length) return [];
  const tail = after.slice(before.length).replace(/^\n/, '');
  return tail.split('\n').filter((line) => line.length > 0);
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

    if (author !== undefined && author !== owner) {
      violations.push({ path: journalPath, kind: 'journal-owner', detail: `Manager ${author} may not write Manager ${owner}'s journal` });
    }

    if (change.status === 'D') {
      violations.push({ path: journalPath, kind: 'journal-removed', detail: 'an append-only journal was deleted' });
    } else if (change.status === 'R' || change.status === 'C' || change.status === 'T') {
      violations.push({ path: journalPath, kind: 'journal-renamed', detail: `an append-only journal was ${change.status === 'R' ? 'renamed' : 'copied or retyped'} from ${previousPath}` });
    } else if (change.status === 'A') {
      if (change.before !== null && change.before !== undefined && change.before !== '') {
        violations.push({ path: journalPath, kind: 'journal-rewritten', detail: 'journal reported as added but content existed at base' });
      }
      record.appended = appendedLines('', change.after ?? '').length;
    } else {
      const before = change.before ?? '';
      const after = change.after ?? '';
      if (!isAppendOnly(before, after)) {
        violations.push({ path: journalPath, kind: 'journal-not-append-only', detail: 'an existing journal line was modified, removed, or reordered' });
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
