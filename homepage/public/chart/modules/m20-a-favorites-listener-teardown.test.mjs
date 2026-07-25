/**
 * M20-A — favorites-manager.js drag listener teardown (document + handle + RAF).
 * Fable correction of the quarantined Composer slice (strong GPT BLOCK).
 *
 * Runs from ANY cwd (all paths resolved from this file + repo-root marker walk)
 * and executes fully in BOTH trees (canonical "chart v 1.4" + homepage/public
 * mirror — the mirror resolves the same repo root and the same prefix blob).
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-a-favorites-listener-teardown.test.mjs"
 *   node --test --test-concurrency=1 \
 *     "homepage/public/chart/modules/m20-a-favorites-listener-teardown.test.mjs"
 *
 * Evidence (explicit atomic writes only):
 *   M20_A_EVIDENCE=red   → behavioral subject is the AUTHENTIC PRE-FIX blob
 *                          (git object 32c916dd0464de6b22042b6c6c1257570313dce8,
 *                          raw/LF sha256 091e2467…, frozen from `git show HEAD:`)
 *   M20_A_EVIDENCE=green → behavioral subject is the current product source
 *   M20_A_EVIDENCE=kill  → verdict computed from kill/A-B discrimination rows
 *   → docs/plan3/evidence/W4-M20-A-FAVORITES-20260724-<mode>[-homepage].json
 *
 * Kill-switch (default fix ON when unset/false):
 *   __TALARIA_DISABLE_M20_A_FAVORITES_LISTENER_TEARDOWN_V1
 *
 * Kill contract (precise — NOT a whole-method byte/AST/verbatim claim): while
 * the switch is active, the product must have ORDERED OBSERVABLE BEHAVIOR
 * PARITY with the authentic pre-fix source for the covered legacy events —
 * every stacked mousedown/mousemove/mouseup and every scheduled RAF runs as
 * pre-fix (2 bindings → 2 callbacks → 2 RAFs), with no generation/identity
 * guard suppression and no shared-state dedupe. Ledger/RAF/touched-target
 * bookkeeping inside the kill path is intentionally non-observable during
 * steady kill mode; fix-ON recovery/destroy additionally cancels/invalidates
 * kill-period RAFs and restores actually-mutated toolbars (transition safety
 * that pre-fix never had). Known limitation: stack frame function names
 * differ from the pre-fix inline anonymous callbacks. Parity is proven by
 * the ordered A/B logs below (one identical scripted event sequence against
 * pre-fix and current+kill); the browser harness (m20-a-favorites-harness/)
 * repeats that A/B in real Chrome/Edge.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo root by marker walk — never depends on process.cwd(). */
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 14; i += 1) {
    if (
      fs.existsSync(path.join(dir, 'docs', 'plan3'))
      && fs.existsSync(path.join(dir, 'chart v 1.4'))
      && fs.existsSync(path.join(dir, 'homepage'))
    ) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`repo root (docs/plan3 + both trees) not found above ${start}`);
}

const REPO_ROOT = findRepoRoot(__dirname);
const TREE = __dirname.includes(`homepage${path.sep}public`) ? 'homepage' : 'canonical';
const CANONICAL_MODULES = path.join(REPO_ROOT, 'chart v 1.4', 'chart', 'modules');
const HOMEPAGE_MODULES = path.join(REPO_ROOT, 'homepage', 'public', 'chart', 'modules');
const LOCAL_PRODUCT = path.join(__dirname, 'favorites-manager.js');
const OTHER_PRODUCT = path.join(
  TREE === 'homepage' ? CANONICAL_MODULES : HOMEPAGE_MODULES, 'favorites-manager.js');
const PREFIX_BLOB = path.join(
  CANONICAL_MODULES, 'm20-a-favorites-harness', 'blobs', 'favorites-manager.prefix.js');
const PREFIX_SHA256 = '754c77f4832e56b2284f1a4a2ce43078192cae371e0524068b62f823284d5382';
const EVIDENCE_DIR = path.join(REPO_ROOT, 'docs', 'plan3', 'evidence');
const require = createRequire(import.meta.url);

const KS = '__TALARIA_DISABLE_M20_A_FAVORITES_LISTENER_TEARDOWN_V1';
const STAMP = '20260724';
const evidenceMode = String(process.env.M20_A_EVIDENCE || '').toLowerCase();
const softAsserts = evidenceMode === 'red';
const evidenceRows = [];

// Silence product console chatter; keep our own row output on stdout.
console.log = () => {};
console.warn = () => {};
console.error = () => {};

function note(fixId, name, pass, detail = '') {
  evidenceRows.push({ q: fixId, name, pass: !!pass, detail });
  process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${fixId}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

function hardAssert(cond, msg) {
  if (!softAsserts) assert.equal(cond, true, msg);
}

function sha256File(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function atomicWriteTextSync(out, text, options = {}) {
  const dir = path.dirname(out);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(out)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    fs.writeFileSync(tmp, text, 'utf8');
    if (options.beforeRename) options.beforeRename(tmp);
    fs.renameSync(tmp, out);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* cleanup best effort */ }
    throw err;
  }
}

function atomicWriteJsonSync(out, payload, options = {}) {
  atomicWriteTextSync(out, `${JSON.stringify(payload, null, 2)}\n`, options);
}

// ─── DOM census ─────────────────────────────────────────────────────────────

function installDomCensus(options = {}) {
  const { deferRaf = false, cancelThrows = false, log = null } = options;
  const listeners = new Map();
  let nextId = 0;
  const tag = (obj, label) => {
    obj.__id = `${label}-${++nextId}`;
    return obj;
  };
  const store = {
    add(target, type, fn) {
      const key = `${target.__id}:${type}`;
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(fn);
      if (log) log.push(`add:${target.__id.replace(/-\d+$/, '')}:${type}`);
    },
    remove(target, type, fn) {
      listeners.get(`${target.__id}:${type}`)?.delete(fn);
    },
    count(target, type) {
      if (!target) return 0;
      return listeners.get(`${target.__id}:${type}`)?.size || 0;
    },
    fns(target, type) {
      if (!target) return [];
      return [...(listeners.get(`${target.__id}:${type}`) || [])];
    },
  };

  const makeStyle = (label) => new Proxy(
    { left: '56px', top: '80px', transition: '', display: 'flex' },
    {
      set(t, k, v) {
        t[k] = v;
        if (log) log.push(`style:${label}:${String(k)}=${v}`);
        return true;
      },
    },
  );
  const makeClassList = (label) => ({
    _set: new Set(),
    add(c) { this._set.add(c); if (log) log.push(`class:${label}:+${c}`); },
    remove(c) { this._set.delete(c); if (log) log.push(`class:${label}:-${c}`); },
    contains(c) { return this._set.has(c); },
  });

  const makeHandle = () => tag({
    addEventListener(type, fn) { store.add(this, type, fn); },
    removeEventListener(type, fn) { store.remove(this, type, fn); },
  }, 'handle');

  const makeToolbar = (handle) => {
    const t = tag({
      style: null,
      classList: null,
      currentHandle: handle,
      rectThrows: false,
      getBoundingClientRect() {
        if (this.rectThrows) throw new Error('detached-rect');
        return { left: 56, top: 80, width: 240, height: 40 };
      },
      querySelector(sel) {
        if (sel === '.favorites-drag-handle') return this.currentHandle;
        return null;
      },
    }, 'toolbar');
    t.style = makeStyle(t.__id.replace(/-\d+$/, ''));
    t.classList = makeClassList(t.__id.replace(/-\d+$/, ''));
    return t;
  };

  const dragHandle = makeHandle();
  const toolbar = makeToolbar(dragHandle);

  const makeDocument = () => tag({
    addEventListener(type, fn) { store.add(this, type, fn); },
    removeEventListener(type, fn) { store.remove(this, type, fn); },
    getElementById(id) {
      if (id === 'favoritesToolbar') return toolbar;
      if (id === 'favoritesTools') return { innerHTML: '', appendChild() {} };
      return null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() {
      return {
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {},
        addEventListener() {},
        appendChild() {},
        querySelector() { return null; },
      };
    },
  }, 'document');

  const documentObj = makeDocument();

  const rafQueue = [];
  let rafId = 0;

  global.window = { innerWidth: 1280, innerHeight: 800, [KS]: false };
  global.document = documentObj;
  global.userStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  global.requestAnimationFrame = (fn) => {
    const id = ++rafId;
    if (log) log.push(`raf:schedule#${id}`);
    if (deferRaf) rafQueue.push({ id, fn });
    else { if (log) log.push(`raf:run#${id}`); fn(); }
    return id;
  };
  global.cancelAnimationFrame = (id) => {
    if (cancelThrows) throw new Error('cancel-fail');
    for (let i = rafQueue.length - 1; i >= 0; i -= 1) {
      if (rafQueue[i].id === id) rafQueue.splice(i, 1);
    }
    if (log) log.push(`raf:cancel#${id}`);
  };

  const flushOne = (index = 0, rethrow = false) => {
    const item = rafQueue.splice(index, 1)[0];
    if (!item) return false;
    if (log) log.push(`raf:run#${item.id}`);
    try { item.fn(); } catch (err) { if (rethrow) throw err; }
    return true;
  };
  const flushRaf = (rethrow = false) => { while (flushOne(0, rethrow)) { /* drain */ } };

  const makeEvent = (type, x, y) => ({
    clientX: x,
    clientY: y,
    preventDefault() { if (log) log.push(`pd:${type}`); },
    stopPropagation() {},
  });
  /** Dispatch to a snapshot of current listeners; returns callbacks executed. */
  const dispatch = (target, type, x = 0, y = 0) => {
    const fns = store.fns(target, type);
    if (log) log.push(`dispatch:${type}:${fns.length}`);
    for (const fn of fns) fn(makeEvent(type, x, y));
    return fns.length;
  };

  return {
    store,
    document: documentObj,
    makeDocument,
    toolbar,
    makeToolbar,
    makeHandle,
    get dragHandle() { return toolbar.currentHandle; },
    replaceHandle(next) { toolbar.currentHandle = next; },
    rafQueue,
    flushOne,
    flushRaf,
    dispatch,
    makeEvent,
    countOn: (target, type) => store.count(target, type),
    countDoc: (type) => store.count(documentObj, type),
    countHandle: (type) => store.count(toolbar.currentHandle, type),
  };
}

// ─── Subject loading ────────────────────────────────────────────────────────

function loadClassFrom(absPath) {
  const resolved = require.resolve(absPath);
  delete require.cache[resolved];
  const mod = require(absPath);
  if (typeof mod === 'function') return mod;
  if (typeof global.window?.FavoritesManager === 'function') return global.window.FavoritesManager;
  return null;
}

const SUBJECT_PATH = evidenceMode === 'red' ? PREFIX_BLOB : LOCAL_PRODUCT;

// ─── Static rows ────────────────────────────────────────────────────────────

test('M20-A static — dual tree, kill-switch, legacy purity, exact-target teardown', () => {
  const src = fs.readFileSync(LOCAL_PRODUCT, 'utf8');
  const other = fs.readFileSync(OTHER_PRODUCT, 'utf8');
  note('M20-A', 'dual-tree-byte-parity', src === other,
    `${TREE} vs ${TREE === 'homepage' ? 'canonical' : 'homepage'}`);

  note('M20-A', 'prefix-blob-integrity', sha256File(PREFIX_BLOB) === PREFIX_SHA256,
    `expected ${PREFIX_SHA256.slice(0, 12)}…`);

  const hasKill = src.includes(KS);
  const hasTeardown = /_teardownDragBindings\s*\(\s*\)\s*\{/.test(src);
  const destroyIdx = src.search(/\bdestroy\s*\(\s*\)\s*\{/);
  const destroyCallsTeardown = destroyIdx >= 0
    && src.slice(destroyIdx, destroyIdx + 400).includes('_teardownDragBindings');

  // Legacy kill path must be guard-free: no generation/identity/shared-RAF
  // state anywhere inside _setupDragLegacy.
  const legacyIdx = src.indexOf('_setupDragLegacy() {');
  const legacyEnd = src.indexOf('// Load visibility state', legacyIdx);
  const legacySlice = legacyIdx >= 0 ? src.slice(legacyIdx, legacyEnd > 0 ? legacyEnd : legacyIdx + 6000) : '';
  const legacyPure = legacySlice.length > 0
    && !legacySlice.includes('bindingAlive')
    && !legacySlice.includes('_favoritesDragGeneration')
    && !legacySlice.includes('_favoritesDragRafId')
    && !legacySlice.includes('_favoritesDragBindings')
    && !legacySlice.includes('_teardownDragBindings');
  const legacyLedgerPassive = legacySlice.includes('_recordFavoritesBinding');

  const setupIdx = src.search(/\bsetupDrag\s*\(\s*\)\s*\{/);
  const setupSlice = setupIdx >= 0 ? src.slice(setupIdx, setupIdx + 7000) : '';
  const drainBeforeEarlyReturn = (() => {
    const drain = setupSlice.indexOf('this._teardownDragBindings()');
    const earlyReturn = setupSlice.indexOf('if (!this.toolbar) return;');
    return drain >= 0 && earlyReturn >= 0 && drain < earlyReturn;
  })();
  const storesExactTargets = setupSlice.includes('const boundDocument = document')
    && setupSlice.includes('const boundToolbar = this.toolbar')
    && setupSlice.includes('const boundHandle = dragHandle');
  const teardownIdx = src.indexOf('_teardownDragBindings() {');
  const teardownSlice = src.slice(teardownIdx, teardownIdx + 3500);
  const teardownUsesBoundTargets = teardownSlice.includes('binding.doc.removeEventListener')
    && teardownSlice.includes('binding.handle.removeEventListener');
  const teardownCleansDrag = teardownSlice.includes('_releaseFavoritesTarget(binding.toolbar)')
    && teardownSlice.includes('_restoreFavoritesTarget(binding.toolbar, binding.preDragTransition');

  note('M20-A', 'kill-switch-present', hasKill, KS);
  note('M20-A', 'teardown-drag-bindings-present', hasTeardown);
  note('M20-A', 'destroy-calls-teardown', destroyCallsTeardown);
  note('M20-A', 'legacy-kill-path-guard-free', legacyPure);
  note('M20-A', 'legacy-kill-path-ledger-passive', legacyLedgerPassive);
  note('M20-A', 'setup-drains-before-early-return', drainBeforeEarlyReturn);
  note('M20-A', 'setup-stores-exact-event-targets', storesExactTargets);
  note('M20-A', 'teardown-removes-from-bound-targets', teardownUsesBoundTargets);
  note('M20-A', 'teardown-cleans-active-drag-visuals', teardownCleansDrag);

  hardAssert(src === other, 'dual-tree byte parity');
  hardAssert(sha256File(PREFIX_BLOB) === PREFIX_SHA256, 'prefix blob integrity');
  hardAssert(hasKill && hasTeardown && destroyCallsTeardown, 'kill/teardown wiring');
  hardAssert(legacyPure && legacyLedgerPassive, 'legacy kill path purity');
  hardAssert(drainBeforeEarlyReturn && storesExactTargets, 'setup drain/exact-target contract');
  hardAssert(teardownUsesBoundTargets && teardownCleansDrag, 'teardown target/visual contract');
});

// ─── Behavioral rows (subject = pre-fix blob in red mode, product otherwise) ─

test('M20-A behavioral — constructor, cycles, identity, teardown, RAF ownership', () => {
  const census = installDomCensus({ deferRaf: true });
  const Subject = loadClassFrom(SUBJECT_PATH);
  note('M20-A', 'subject-loadable', typeof Subject === 'function',
    `${path.basename(SUBJECT_PATH)} (${evidenceMode || 'default'})`);
  if (typeof Subject !== 'function') {
    hardAssert(false, 'subject class missing');
    return;
  }

  const doc = census.document;
  const base = () => ({
    move: census.countDoc('mousemove'),
    up: census.countDoc('mouseup'),
    down: census.countHandle('mousedown'),
  });

  // 1. Real constructor installs exactly one doc pair + one handle mousedown.
  {
    window[KS] = false;
    const b = base();
    const fm = new Subject({});
    const after = base();
    note('M20-A', 'constructor-installs-single-pair',
      after.move === b.move + 1 && after.up === b.up + 1 && after.down === b.down + 1,
      `moveΔ=${after.move - b.move} upΔ=${after.up - b.up} downΔ=${after.down - b.down}`);
    hardAssert(after.move === b.move + 1 && after.down === b.down + 1, 'constructor single pair');

    // 2. Reinit flat.
    fm.setupDrag();
    const reinit = base();
    note('M20-A', 'reinit-flat',
      reinit.move === b.move + 1 && reinit.up === b.up + 1 && reinit.down === b.down + 1,
      `moveΔ=${reinit.move - b.move} downΔ=${reinit.down - b.down}`);
    hardAssert(reinit.move === b.move + 1 && reinit.down === b.down + 1, 'reinit must not stack');

    // 3. destroy() drains everything; double destroy idempotent.
    const hasDestroy = typeof fm.destroy === 'function';
    note('M20-A', 'destroy-api-present', hasDestroy, hasDestroy ? '' : 'destroy absent (pre-fix)');
    if (hasDestroy) fm.destroy();
    const afterDestroy = base();
    note('M20-A', 'destroy-drains-doc-and-handle',
      hasDestroy && afterDestroy.move === b.move && afterDestroy.up === b.up && afterDestroy.down === b.down,
      `moveΔ=${afterDestroy.move - b.move} downΔ=${afterDestroy.down - b.down}`);
    if (hasDestroy) fm.destroy();
    const afterDouble = base();
    note('M20-A', 'double-destroy-idempotent',
      hasDestroy && afterDouble.move === b.move && afterDouble.down === b.down);
    hardAssert(afterDestroy.move === b.move && afterDestroy.down === b.down, 'destroy must drain');
  }

  // 4. 100 and 1000 reinit cycles stay flat; repeated setup/destroy stays flat.
  {
    window[KS] = false;
    const b = base();
    const fm = new Subject({});
    for (let i = 0; i < 100; i += 1) fm.setupDrag();
    const at100 = base();
    note('M20-A', 'reinit-100-cycles-flat',
      at100.move === b.move + 1 && at100.down === b.down + 1, `moveΔ=${at100.move - b.move}`);
    for (let i = 0; i < 900; i += 1) fm.setupDrag();
    const at1000 = base();
    note('M20-A', 'reinit-1000-cycles-flat',
      at1000.move === b.move + 1 && at1000.down === b.down + 1, `moveΔ=${at1000.move - b.move}`);
    hardAssert(at1000.move === b.move + 1, '1000 cycles must stay flat');

    let cyclesFlat = true;
    for (let i = 0; i < 50; i += 1) {
      fm.setupDrag();
      if (typeof fm.destroy === 'function') fm.destroy();
      const now = base();
      if (now.move !== b.move || now.down !== b.down) { cyclesFlat = false; break; }
    }
    note('M20-A', 'setup-destroy-50-cycles-flat', typeof fm.destroy === 'function' && cyclesFlat);
    hardAssert(cyclesFlat, 'setup/destroy cycles must stay flat');
  }

  // 5. Handle identity: replacement removes the OLD handle's binding only.
  {
    window[KS] = false;
    const fm = new Subject({});
    const oldHandle = census.dragHandle;
    const newHandle = census.makeHandle();
    census.replaceHandle(newHandle);
    fm.setupDrag();
    note('M20-A', 'handle-replacement-old-removed-new-single',
      census.countOn(oldHandle, 'mousedown') === 0 && census.countOn(newHandle, 'mousedown') === 1,
      `old=${census.countOn(oldHandle, 'mousedown')} new=${census.countOn(newHandle, 'mousedown')}`);
    hardAssert(census.countOn(oldHandle, 'mousedown') === 0, 'old handle binding must be removed');
    if (typeof fm.destroy === 'function') fm.destroy();
    census.replaceHandle(oldHandle);
  }

  // 6. Document identity: teardown must remove from the EXACT document the
  //    binding was installed on, even after global document replacement.
  {
    window[KS] = false;
    const b = base();
    const fm = new Subject({});
    const installedOn = base();
    const otherDoc = census.makeDocument();
    global.document = otherDoc;
    if (typeof fm.destroy === 'function') fm.destroy();
    const originalDrained = census.countOn(doc, 'mousemove') === b.move
      && census.countOn(doc, 'mouseup') === b.up;
    note('M20-A', 'global-document-replacement-exact-target-teardown',
      typeof fm.destroy === 'function' && originalDrained,
      `installedΔ=${installedOn.move - b.move} afterDestroyΔ=${census.countOn(doc, 'mousemove') - b.move}`);
    hardAssert(originalDrained, 'teardown must remove from original document identity');
    global.document = doc;
  }

  // 7. Detached/null toolbar rebind drains prior bindings BEFORE early return.
  {
    window[KS] = false;
    const b = base();
    const fm = new Subject({});
    fm.toolbar = null;
    fm.setupDrag(); // early-return path — must still drain
    const drained = base();
    note('M20-A', 'null-toolbar-rebind-drains-prior',
      drained.move === b.move && drained.up === b.up && drained.down === b.down,
      `moveΔ=${drained.move - b.move} downΔ=${drained.down - b.down}`);
    hardAssert(drained.move === b.move && drained.down === b.down,
      'null-toolbar rebind must drain prior bindings');

    const fm2 = new Subject({});
    const withHandle = base();
    census.replaceHandle(null); // handle detached/replaced with nothing
    fm2.setupDrag();
    const drained2 = base();
    note('M20-A', 'missing-handle-rebind-drains-prior',
      withHandle.move === b.move + 1 && drained2.move === b.move && drained2.up === b.up,
      `beforeΔ=${withHandle.move - b.move} afterΔ=${drained2.move - b.move}`);
    hardAssert(drained2.move === b.move, 'missing-handle rebind must drain prior bindings');
    census.replaceHandle(census.makeHandle());
  }

  // 8. Active-drag teardown: .dragging removed, transition restored, drag
  //    state reset — on the EXACT toolbar bound at install, even replaced.
  {
    window[KS] = false;
    const fm = new Subject({});
    const boundToolbar = census.toolbar;
    boundToolbar.style.transition = 'all 0.2s';
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    const midDrag = boundToolbar.classList.contains('dragging')
      && boundToolbar.style.transition === 'none' && fm.isDragging === true;
    note('M20-A', 'mousedown-marks-active-drag', midDrag);
    census.dispatch(doc, 'mousemove', 140, 120); // schedule RAF
    const pendingRaf = census.rafQueue.length;
    // Replace the manager's toolbar reference mid-drag (detached/replaced).
    fm.toolbar = census.makeToolbar(census.makeHandle());
    if (typeof fm.destroy === 'function') fm.destroy();
    const cleaned = !boundToolbar.classList.contains('dragging')
      && boundToolbar.style.transition === 'all 0.2s'
      && fm.isDragging === false;
    note('M20-A', 'destroy-mid-drag-cleans-bound-toolbar',
      typeof fm.destroy === 'function' && cleaned,
      `class=${boundToolbar.classList.contains('dragging')} transition="${boundToolbar.style.transition}" dragging=${fm.isDragging}`);
    hardAssert(cleaned, 'destroy mid-drag must clean the bound toolbar visual state');
    note('M20-A', 'destroy-mid-drag-cancels-pending-raf',
      pendingRaf === 1 && census.rafQueue.length === 0,
      `pendingBefore=${pendingRaf} after=${census.rafQueue.length}`);
    hardAssert(census.rafQueue.length === 0, 'destroy must cancel its pending RAF');
    const leftBefore = boundToolbar.style.left;
    census.flushRaf();
    note('M20-A', 'stale-raf-after-destroy-no-style-write',
      boundToolbar.style.left === leftBefore, `left=${boundToolbar.style.left}`);
    boundToolbar.style.transition = '';
  }

  // 9. Two managers: destroy(A) removes only A's bindings.
  {
    window[KS] = false;
    const b = base();
    const a = new Subject({});
    const c = new Subject({});
    const two = base();
    note('M20-A', 'two-managers-two-pairs',
      two.move === b.move + 2 && two.up === b.up + 2 && two.down === b.down + 2);
    if (typeof a.destroy === 'function') a.destroy();
    const afterA = base();
    note('M20-A', 'two-managers-destroy-isolated',
      typeof a.destroy === 'function' && afterA.move === b.move + 1 && afterA.down === b.down + 1,
      `moveΔ=${afterA.move - b.move}`);
    hardAssert(afterA.move === b.move + 1, 'destroy must not remove the other manager\'s refs');
    if (typeof c.destroy === 'function') c.destroy();
    const afterBoth = base();
    note('M20-A', 'two-managers-both-flat', afterBoth.move === b.move && afterBoth.down === b.down);
  }

  // 10. ON → OFF → ON ledger recovery + bounded ledger cleanup.
  {
    window[KS] = false;
    const b = base();
    const fm = new Subject({});          // ON: 1 pair
    window[KS] = true;
    fm.setupDrag();                      // OFF stacks (legacy)
    fm.setupDrag();                      // OFF stacks again
    const off = base();
    note('M20-A', 'off-period-stacks-like-legacy',
      off.move >= b.move + 3 && off.down >= b.down + 3,
      `moveΔ=${off.move - b.move} downΔ=${off.down - b.down}`);
    window[KS] = false;
    fm.setupDrag();                      // ON: recover ledger + rebind single
    const recovered = base();
    note('M20-A', 'on-off-on-recovery-flat',
      recovered.move === b.move + 1 && recovered.up === b.up + 1 && recovered.down === b.down + 1,
      `moveΔ=${recovered.move - b.move} downΔ=${recovered.down - b.down}`);
    hardAssert(recovered.move === b.move + 1, 'ON recovery must flatten OFF-period stacking');
    const ledgerBounded = !fm._favoritesBindingLedger || fm._favoritesBindingLedger.length === 0;
    note('M20-A', 'ledger-bounded-after-recovery', ledgerBounded,
      `len=${fm._favoritesBindingLedger ? fm._favoritesBindingLedger.length : 'n/a'}`);
    hardAssert(ledgerBounded, 'ledger must be emptied by recovery');
    if (typeof fm.destroy === 'function') fm.destroy();
    const flat = base();
    note('M20-A', 'on-off-on-destroy-flat', flat.move === b.move && flat.down === b.down);
    hardAssert(flat.move === b.move, 'final destroy must return to base');
  }

  window[KS] = false;
});

// ─── RAF ownership: delayed/reordered/cancel-failed callbacks ──────────────

test('M20-A RAF ownership — stale callbacks may clear only their own token', () => {
  const census = installDomCensus({ deferRaf: true, cancelThrows: true });
  const Subject = loadClassFrom(SUBJECT_PATH);
  if (typeof Subject !== 'function') { hardAssert(false, 'subject class missing'); return; }
  window[KS] = false;

  const fm = new Subject({});
  const hasDestroy = typeof fm.destroy === 'function';

  // Drag + move schedules rafA.
  census.dispatch(census.dragHandle, 'mousedown', 100, 100);
  census.dispatch(census.document, 'mousemove', 130, 110);
  const rafA = census.rafQueue[0]?.id ?? null;
  note('M20-A', 'raf-scheduled-on-move', rafA != null, `id=${rafA}`);

  // destroy: cancelAnimationFrame THROWS, so rafA stays queued (cancel-failed).
  let destroySurvivedCancelThrow = true;
  try { if (hasDestroy) fm.destroy(); } catch (_) { destroySurvivedCancelThrow = false; }
  note('M20-A', 'teardown-survives-cancel-throw', hasDestroy && destroySurvivedCancelThrow);
  hardAssert(hasDestroy && destroySurvivedCancelThrow, 'teardown must survive cancel throw');
  const drained = census.countDoc('mousemove') === 0 && census.countHandle('mousedown') === 0;
  note('M20-A', 'teardown-drains-despite-cancel-throw', drained,
    `move=${census.countDoc('mousemove')} down=${census.countHandle('mousedown')}`);
  hardAssert(drained, 'listeners must drain even when cancel throws');

  // Rebind: new binding schedules rafB; shared token must point at rafB.
  fm.toolbar = census.toolbar;
  fm.setupDrag();
  census.dispatch(census.dragHandle, 'mousedown', 200, 150);
  census.dispatch(census.document, 'mousemove', 260, 170);
  const rafB = census.rafQueue.length >= 2 ? census.rafQueue[1].id : null;
  const sharedIsB = fm._favoritesDragRafId === rafB && rafB != null;
  note('M20-A', 'newer-raf-token-registered', sharedIsB, `shared=${fm._favoritesDragRafId} rafB=${rafB}`);
  hardAssert(sharedIsB, 'newer binding must own the shared RAF token');

  // Delayed stale rafA fires AFTER rafB was scheduled: it must not null the
  // newer token and must not write styles for the dead generation.
  const leftBefore = census.toolbar.style.left;
  census.flushOne(0); // rafA (stale)
  const staleRespectedOwnership = fm._favoritesDragRafId === rafB
    && census.toolbar.style.left === leftBefore;
  note('M20-A', 'stale-raf-clears-only-own-token', staleRespectedOwnership,
    `shared=${fm._favoritesDragRafId} left=${census.toolbar.style.left}`);
  hardAssert(staleRespectedOwnership, 'stale RAF must never clear a newer callback token/state');

  // rafB then applies normally and clears its own token.
  census.flushOne(0);
  const applied = census.toolbar.style.left !== leftBefore && fm._favoritesDragRafId == null;
  note('M20-A', 'live-raf-applies-and-clears-own-token', applied,
    `left=${census.toolbar.style.left} shared=${fm._favoritesDragRafId}`);
  hardAssert(applied, 'live RAF must apply position and clear its own token');

  // Reordered case: schedule rafC, then run it, then re-run a stale flush.
  census.dispatch(census.document, 'mousemove', 300, 190);
  const rafC = census.rafQueue[0]?.id ?? null;
  census.flushOne(0); // rafC runs (newest first — reordered relative to nothing pending)
  note('M20-A', 'reordered-raf-run-safe', rafC != null && fm._favoritesDragRafId == null);

  // Callback interior throw containment: force rect throw during live drag.
  census.toolbar.rectThrows = true;
  census.dispatch(census.document, 'mousemove', 320, 210);
  let contained = true;
  try { census.flushRaf(true); } catch (_) { contained = false; }
  census.toolbar.rectThrows = false;
  note('M20-A', 'raf-callback-exception-contained', contained);
  hardAssert(contained, 'RAF callback exceptions must not propagate');

  if (hasDestroy) { try { fm.destroy(); } catch (_) { /* cancel throws again */ } }
  window[KS] = false;
});

// ─── Exact-kill A/B: pre-fix source vs current source with switch ON ───────

/** One scripted event sequence, replayed identically against both subjects. */
function runKillScript(SubjectClass, killValue) {
  const log = [];
  const census = installDomCensus({ deferRaf: true, log });
  window[KS] = killValue;
  const fm = new SubjectClass({});
  fm.setupDrag(); // second stacked binding — legacy must stack, not dedupe
  log.push(`state:isDragging=${fm.isDragging}`);
  log.push(`count:move=${census.countDoc('mousemove')}:up=${census.countDoc('mouseup')}:down=${census.countHandle('mousedown')}`);

  census.dispatch(census.dragHandle, 'mousedown', 100, 100);
  log.push(`state:isDragging=${fm.isDragging}`);
  census.dispatch(census.document, 'mousemove', 150, 130);
  census.dispatch(census.document, 'mousemove', 180, 140);
  log.push(`raf:pending=${census.rafQueue.length}`);
  census.flushRaf();
  log.push(`style:final=${census.toolbar.style.left},${census.toolbar.style.top}`);
  census.dispatch(census.document, 'mouseup', 180, 140);
  log.push(`state:isDragging=${fm.isDragging}`);
  log.push(`class:dragging=${census.toolbar.classList.contains('dragging')}`);

  // Stale-binding execution probes (2 bindings → BOTH callbacks must run):
  const downs = census.store.fns(census.dragHandle, 'mousedown');
  const ups = census.store.fns(census.document, 'mouseup');
  log.push(`probe:staleDown:count=${downs.length}`);
  if (downs.length > 0) {
    downs[0](census.makeEvent('mousedown', 90, 90)); // OLDEST stacked binding only
    log.push(`probe:staleDown:isDragging=${fm.isDragging}`);
  }
  if (ups.length > 0) {
    ups[0](census.makeEvent('mouseup', 90, 90)); // OLDEST stacked binding only
    log.push(`probe:staleUp:isDragging=${fm.isDragging}`);
  }
  window[KS] = false;
  return { log, census, fm };
}

test('M20-A exact-kill A/B — current(kill ON) behavior log equals authentic pre-fix log', () => {
  const Prefix = (() => {
    installDomCensus({});
    return loadClassFrom(PREFIX_BLOB);
  })();
  const Current = (() => {
    installDomCensus({});
    return loadClassFrom(LOCAL_PRODUCT);
  })();
  note('M20-A', 'ab-subjects-loadable',
    typeof Prefix === 'function' && typeof Current === 'function',
    `prefix=${typeof Prefix} current=${typeof Current}`);
  if (typeof Prefix !== 'function' || typeof Current !== 'function') {
    hardAssert(false, 'A/B subjects missing');
    return;
  }

  const a = runKillScript(Prefix, false); // authentic pre-fix (no switch exists)
  const b = runKillScript(Current, true); // current source, kill switch ON

  const equal = JSON.stringify(a.log) === JSON.stringify(b.log);
  let firstDiff = '';
  if (!equal) {
    const max = Math.max(a.log.length, b.log.length);
    for (let i = 0; i < max; i += 1) {
      if (a.log[i] !== b.log[i]) { firstDiff = `#${i}: prefix="${a.log[i]}" vs kill="${b.log[i]}"`; break; }
    }
  }
  note('M20-A', 'kill-ab-log-exact-match', equal,
    equal ? `${a.log.length} entries` : firstDiff);
  hardAssert(equal, `exact-kill A/B mismatch: ${firstDiff}`);

  // Explicit discrimination sub-rows (also derivable from the logs):
  const twoCallbacks = a.log.filter((l) => l.startsWith('dispatch:mousemove:2')).length > 0
    && b.log.filter((l) => l.startsWith('dispatch:mousemove:2')).length > 0;
  note('M20-A', 'kill-two-bindings-two-callbacks', twoCallbacks);
  const twoRafs = a.log.includes('raf:pending=2') && b.log.includes('raf:pending=2');
  note('M20-A', 'kill-two-bindings-two-rafs', twoRafs);
  const staleDownRuns = a.log.includes('probe:staleDown:isDragging=true')
    && b.log.includes('probe:staleDown:isDragging=true');
  note('M20-A', 'kill-stale-mousedown-executes', staleDownRuns);
  const staleUpRuns = a.log.includes('probe:staleUp:isDragging=false')
    && b.log.includes('probe:staleUp:isDragging=false');
  note('M20-A', 'kill-stale-mouseup-executes', staleUpRuns);
  hardAssert(twoCallbacks && twoRafs && staleDownRuns && staleUpRuns,
    'kill mode must preserve full legacy stacked-callback execution');
});

test('M20-A kill-switch — legacy stacking + destroy no-op + fix-ON recovery', () => {
  const census = installDomCensus({ deferRaf: true });
  const Current = loadClassFrom(LOCAL_PRODUCT);
  if (typeof Current !== 'function') { hardAssert(false, 'product class missing'); return; }

  window[KS] = true;
  const b = {
    move: census.countDoc('mousemove'),
    up: census.countDoc('mouseup'),
    down: census.countHandle('mousedown'),
  };
  const fm = new Current({});
  fm.setupDrag();
  const stacked = census.countDoc('mousemove') === b.move + 2
    && census.countDoc('mouseup') === b.up + 2
    && census.countHandle('mousedown') === b.down + 2;
  note('M20-A', 'kill-restores-legacy-stacking', stacked,
    `moveΔ=${census.countDoc('mousemove') - b.move} downΔ=${census.countHandle('mousedown') - b.down}`);
  hardAssert(stacked, 'kill mode must stack like legacy');

  fm.destroy();
  const destroyNoop = census.countDoc('mousemove') === b.move + 2;
  note('M20-A', 'kill-destroy-no-op', destroyNoop);
  hardAssert(destroyNoop, 'destroy under kill must remain a legacy no-op');

  window[KS] = false;
  fm.setupDrag(); // fix ON: ledger recovery + fresh single binding
  fm.destroy();
  const recovered = census.countDoc('mousemove') === b.move
    && census.countHandle('mousedown') === b.down;
  note('M20-A', 'kill-then-fix-on-full-recovery', recovered,
    `moveΔ=${census.countDoc('mousemove') - b.move}`);
  hardAssert(recovered, 'fix ON after kill must recover every kill-period binding');
});

// ─── Defect 1: kill-period RAF must not survive recovery/destroy ───────────
// Fresh-GPT repro: kill binding schedules one RAF → fix-ON setupDrag()
// recovers → destroy() → delayed/native RAF flush must NOT mutate the toolbar
// (pre-fix moves 56px/80px to 180px/140px) and no RAF may remain owned/queued.

test('M20-A kill RAF recovery — kill-period RAFs cancelled or inert through recovery/destroy', () => {
  const Subject = (() => { installDomCensus({}); return loadClassFrom(SUBJECT_PATH); })();
  if (typeof Subject !== 'function') { hardAssert(false, 'subject class missing'); return; }

  // 1. Exact reproduction sequence (clean cancel path).
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    const leftBase = census.toolbar.style.left;                  // constructor may write defaults
    const topBase = census.toolbar.style.top;
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // offset 44/20
    census.dispatch(census.document, 'mousemove', 224, 160);     // → would write 180px/140px
    const queuedBefore = census.rafQueue.length;
    window[KS] = false;
    fm.setupDrag();                                              // fix-ON recovery
    if (typeof fm.destroy === 'function') fm.destroy();
    const queuedAfter = census.rafQueue.length;
    census.flushRaf();                                           // delayed/native flush
    note('M20-A', 'kill-raf-cancelled-on-recovery',
      queuedBefore === 1 && queuedAfter === 0, `queued ${queuedBefore}→${queuedAfter}`);
    note('M20-A', 'kill-raf-recovery-no-style-write',
      census.toolbar.style.left === leftBase && census.toolbar.style.top === topBase,
      `left=${census.toolbar.style.left} top=${census.toolbar.style.top} (pre-fix mutates to 180px/140px)`);
    const zero = (fm._favoritesBindingLedger || []).length === 0
      && (fm._favoritesDragBindings || []).length === 0
      && fm._favoritesDragRafId == null
      && census.countDoc('mousemove') === 0 && census.countHandle('mousedown') === 0
      && census.rafQueue.length === 0;
    note('M20-A', 'kill-recovery-ownership-zero', zero,
      `ledger=${(fm._favoritesBindingLedger || []).length} bindings=${(fm._favoritesDragBindings || []).length} raf=${census.rafQueue.length}`);
    hardAssert(queuedAfter === 0 && zero, 'kill-period RAF must be cancelled and ownership zeroed');
    hardAssert(census.toolbar.style.left === leftBase && census.toolbar.style.top === topBase,
      'delayed kill RAF must not mutate toolbar');
  }

  // 2. Cancel failure/race: stale kill callback must be inert and must never
  //    clear or overwrite a newer fix-ON token.
  {
    const census = installDomCensus({ deferRaf: true, cancelThrows: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    census.dispatch(census.document, 'mousemove', 224, 160);     // kill RAF (cancel will throw)
    window[KS] = false;
    let recoverySurvived = true;
    try { fm.setupDrag(); } catch (_) { recoverySurvived = false; }
    note('M20-A', 'kill-recovery-survives-cancel-throw', recoverySurvived);
    // OFF→ON→new drag: fix-ON binding schedules a newer token.
    census.dispatch(census.dragHandle, 'mousedown', 200, 150);
    census.dispatch(census.document, 'mousemove', 260, 170);
    const newer = fm._favoritesDragRafId;
    const leftBefore = census.toolbar.style.left;
    census.flushOne(0);                                          // STALE kill RAF fires first
    note('M20-A', 'kill-stale-raf-inert-after-cancel-failure',
      census.toolbar.style.left === leftBefore, `left=${census.toolbar.style.left}`);
    note('M20-A', 'kill-stale-raf-preserves-fixon-token',
      newer != null && fm._favoritesDragRafId === newer,
      `newer=${newer} shared=${fm._favoritesDragRafId}`);
    census.flushOne(0);                                          // newer fix-ON RAF applies
    note('M20-A', 'off-on-new-drag-raf-applies',
      newer != null && census.toolbar.style.left !== leftBefore && fm._favoritesDragRafId == null,
      `left=${census.toolbar.style.left}`);
    hardAssert(recoverySurvived, 'recovery must survive cancel throw');
    hardAssert(census.toolbar.style.left !== leftBefore, 'new fix-ON drag must work after recovery');
    if (typeof fm.destroy === 'function') { try { fm.destroy(); } catch (_) { /* cancel throws */ } }
  }

  // 3. Multiple stacked kill bindings/RAFs — all cancelled on recovery;
  //    repeated recovery/destroy stays idempotent and bounded.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    fm.setupDrag();                                              // stacked kill binding
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    census.dispatch(census.document, 'mousemove', 224, 160);     // 2 closures → 2 RAFs
    const q = census.rafQueue.length;
    window[KS] = false;
    fm.setupDrag();                                              // recovery cancels BOTH
    const qAfter = census.rafQueue.length;
    if (typeof fm.destroy === 'function') fm.destroy();
    census.flushRaf();
    note('M20-A', 'kill-multi-raf-all-cancelled',
      q === 2 && qAfter === 0 && census.toolbar.style.left === '56px',
      `queued ${q}→${qAfter} left=${census.toolbar.style.left}`);
    hardAssert(q === 2 && qAfter === 0, 'every stacked kill RAF must be cancelled');

    let flat = true;
    for (let i = 0; i < 5; i += 1) {
      fm.setupDrag();
      if (typeof fm.destroy === 'function') fm.destroy(); else flat = false;
    }
    flat = flat && (fm._favoritesBindingLedger || []).length === 0
      && census.countDoc('mousemove') === 0 && census.rafQueue.length === 0;
    note('M20-A', 'kill-recovery-repeat-idempotent', flat,
      `ledger=${(fm._favoritesBindingLedger || []).length} move=${census.countDoc('mousemove')}`);
    hardAssert(flat, 'repeated recovery/destroy must stay at zero');
  }

  // 4. Reordered stale callbacks after cancel failure — every one inert.
  {
    const census = installDomCensus({ deferRaf: true, cancelThrows: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    fm.setupDrag();
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    census.dispatch(census.document, 'mousemove', 224, 160);     // 2 kill RAFs (cancel throws)
    window[KS] = false;
    try { fm.setupDrag(); } catch (_) { /* cancel throws */ }
    if (typeof fm.destroy === 'function') { try { fm.destroy(); } catch (_) { /* cancel throws */ } }
    const leftBefore = census.toolbar.style.left;
    census.flushOne(census.rafQueue.length - 1);                 // reordered: newest first
    census.flushOne(0);
    note('M20-A', 'kill-reordered-stale-rafs-inert',
      census.toolbar.style.left === leftBefore && census.rafQueue.length === 0,
      `left=${census.toolbar.style.left} queue=${census.rafQueue.length}`);
    hardAssert(census.toolbar.style.left === leftBefore, 'reordered stale kill RAFs must be inert');
  }

  // 5. Manager isolation: X's recovery cancels only X's kill RAF and leaves
  //    Y's kill bindings/RAF live; both return to zero after Y's destroy.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const x = new C({});
    const y = new C({});
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // both managers
    census.dispatch(census.document, 'mousemove', 224, 160);     // 2 RAFs (one each)
    window[KS] = false;
    x.setupDrag();                                               // recover X only
    if (typeof x.destroy === 'function') x.destroy();
    const isolated = census.rafQueue.length === 1 && census.countDoc('mousemove') === 1;
    note('M20-A', 'kill-recovery-manager-isolated', isolated,
      `queue=${census.rafQueue.length} move=${census.countDoc('mousemove')}`);
    const leftBefore = census.toolbar.style.left;
    census.flushRaf();                                           // Y's kill RAF still live
    note('M20-A', 'kill-recovery-peer-still-live',
      census.toolbar.style.left !== leftBefore, `left=${leftBefore}→${census.toolbar.style.left}`);
    if (typeof y.destroy === 'function') y.destroy();
    const bothZero = census.countDoc('mousemove') === 0 && census.countHandle('mousedown') === 0
      && census.rafQueue.length === 0
      && (x._favoritesBindingLedger || []).length === 0
      && (y._favoritesBindingLedger || []).length === 0;
    note('M20-A', 'kill-recovery-both-managers-zero', bothZero,
      `move=${census.countDoc('mousemove')} queue=${census.rafQueue.length}`);
    hardAssert(isolated && bothZero, 'recovery must be per-manager and end at zero');
  }

  window[KS] = false;
});

// ─── Defect 2: replaced-toolbar visual target must be cleaned ──────────────
// Fresh-GPT repro: bind on toolbar A in kill mode, replace this.toolbar with
// B, old handle mousedown mutates B (.dragging + transition:none), then ON
// recovery/destroy. The previous build cleaned A and left B dirty.

test('M20-A kill replaced-toolbar — actually-mutated targets cleaned, untouched left alone', () => {
  const Subject = (() => { installDomCensus({}); return loadClassFrom(SUBJECT_PATH); })();
  if (typeof Subject !== 'function') { hardAssert(false, 'subject class missing'); return; }

  // 1. A→B repro + cleanup idempotence.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    const A = census.toolbar;
    A.style.transition = 'opacity 1s';                           // distinctive, must survive
    const B = census.makeToolbar(null);                          // no handle → pure recovery
    B.style.transition = 'all 0.3s';
    fm.toolbar = B;                                              // dynamic replacement
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // old handle mutates B
    note('M20-A', 'kill-replaced-toolbar-B-dirty-before-recovery',
      B.classList.contains('dragging') && B.style.transition === 'none',
      `class=${B.classList.contains('dragging')} transition="${B.style.transition}"`);
    window[KS] = false;
    fm.setupDrag();                                              // recovery (B has no handle)
    const bClean = !B.classList.contains('dragging') && B.style.transition === 'all 0.3s';
    note('M20-A', 'kill-recovery-cleans-actual-target-B', bClean,
      `class=${B.classList.contains('dragging')} transition="${B.style.transition}"`);
    const aUntouched = A.style.transition === 'opacity 1s' && !A.classList.contains('dragging');
    note('M20-A', 'kill-recovery-leaves-A-untouched', aUntouched,
      `A.transition="${A.style.transition}"`);
    note('M20-A', 'kill-recovery-resets-drag-state',
      fm.isDragging === false && fm.dragOffset && fm.dragOffset.x === 0 && fm.dragOffset.y === 0,
      `isDragging=${fm.isDragging} offset=${fm.dragOffset && `${fm.dragOffset.x},${fm.dragOffset.y}`}`);
    if (typeof fm.destroy === 'function') fm.destroy();          // second cleanup pass
    note('M20-A', 'kill-target-cleanup-idempotent',
      !B.classList.contains('dragging') && B.style.transition === 'all 0.3s',
      `transition="${B.style.transition}" after second pass`);
    hardAssert(bClean && aUntouched, 'recovery must clean B (mutated) and leave A (untouched) alone');
    A.style.transition = '';
  }

  // 2. A→B→C: only B (the actually-touched target) is cleaned.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    const A = census.toolbar;
    A.style.transition = 'opacity 1s';
    const B = census.makeToolbar(null);
    B.style.transition = 'all 0.3s';
    const Cbar = census.makeToolbar(null);
    Cbar.style.transition = 'transform 2s';
    fm.toolbar = B;
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // touches B
    fm.toolbar = Cbar;                                           // second replacement
    window[KS] = false;
    fm.setupDrag();
    if (typeof fm.destroy === 'function') fm.destroy();
    note('M20-A', 'kill-abc-B-cleaned',
      !B.classList.contains('dragging') && B.style.transition === 'all 0.3s',
      `class=${B.classList.contains('dragging')} transition="${B.style.transition}"`);
    note('M20-A', 'kill-abc-C-untouched',
      Cbar.style.transition === 'transform 2s' && !Cbar.classList.contains('dragging'),
      `C.transition="${Cbar.style.transition}"`);
    note('M20-A', 'kill-abc-A-untouched',
      A.style.transition === 'opacity 1s' && !A.classList.contains('dragging'),
      `A.transition="${A.style.transition}"`);
    hardAssert(!B.classList.contains('dragging') && B.style.transition === 'all 0.3s',
      'A→B→C: touched B must be cleaned');
    hardAssert(Cbar.style.transition === 'transform 2s' && A.style.transition === 'opacity 1s',
      'A→B→C: untouched A and C must be left alone');
    A.style.transition = '';
  }

  // 3. Active RAF against replaced target — cancelled, no position write on B.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    const B = census.makeToolbar(null);
    B.style.transition = 'all 0.3s';
    fm.toolbar = B;
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    census.dispatch(census.document, 'mousemove', 224, 160);     // RAF targets B
    window[KS] = false;
    fm.setupDrag();
    if (typeof fm.destroy === 'function') fm.destroy();
    census.flushRaf();
    note('M20-A', 'kill-replaced-toolbar-raf-cancelled',
      census.rafQueue.length === 0 && B.style.left === '56px' && B.style.top === '80px'
      && !B.classList.contains('dragging') && B.style.transition === 'all 0.3s',
      `left=${B.style.left} top=${B.style.top} transition="${B.style.transition}"`);
    hardAssert(B.style.left === '56px', 'cancelled kill RAF must not move the replaced toolbar');
  }

  // 4. Detached touched target — classList.remove throws; cleanup survives
  //    and still restores the transition.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    const B = census.makeToolbar(null);
    B.style.transition = 'all 0.3s';
    fm.toolbar = B;
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // B dirty
    B.classList.remove = () => { throw new Error('detached'); };
    window[KS] = false;
    let survived = true;
    try {
      fm.setupDrag();
      if (typeof fm.destroy === 'function') fm.destroy();
    } catch (_) { survived = false; }
    note('M20-A', 'kill-detached-target-cleanup-survives',
      survived && B.style.transition === 'all 0.3s',
      `survived=${survived} transition="${B.style.transition}"`);
    hardAssert(survived, 'detached touched target must not break recovery');
  }

  // 5. Legacy mouseup already resolved the target — recovery must NOT
  //    re-restore the captured pre-drag transition over legacy's own cleanup.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    const B = census.makeToolbar(null);
    B.style.transition = 'all 0.3s';
    fm.toolbar = B;
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    census.dispatch(census.document, 'mouseup', 100, 100);       // legacy cleans B: transition=''
    const afterMouseUp = B.style.transition;
    window[KS] = false;
    fm.setupDrag();
    if (typeof fm.destroy === 'function') fm.destroy();
    note('M20-A', 'kill-mouseup-resolved-target-not-rerestored',
      afterMouseUp === '' && B.style.transition === '' && !B.classList.contains('dragging'),
      `afterMouseUp="${afterMouseUp}" final="${B.style.transition}"`);
    hardAssert(B.style.transition === '', 'legacy-resolved target must keep legacy end state');
  }

  window[KS] = false;
});

// ─── Defect 3: stacked kill bindings vs one replacement toolbar ─────────────
// Fresh-GPT repro: TWO stacked kill bindings both fire on one mousedown (native
// listener order). The first captures the target's true pre-drag transition;
// the second must NOT capture the now-dirty 'none' and overwrite the baseline
// at recovery. A mouseup-resolved target is terminally resolved across EVERY
// stacked binding — recovery must never reapply a captured 'none'.

test('M20-A kill stacked-binding transitions — earliest baseline + terminal mouseup resolution', () => {
  const Subject = (() => { installDomCensus({}); return loadClassFrom(SUBJECT_PATH); })();
  if (typeof Subject !== 'function') { hardAssert(false, 'subject class missing'); return; }

  // 1. Stacked A→B: earliest true baseline must win.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});                                        // binding 1
    fm.setupDrag();                                              // binding 2 (stacked)
    const A = census.toolbar;
    A.style.transition = 'opacity 1s';
    const B = census.makeToolbar(null);
    B.style.transition = 'all 0.3s';
    fm.toolbar = B;
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // BOTH bindings fire in order
    note('M20-A', 'kill-stacked-B-dirty-before-recovery',
      B.classList.contains('dragging') && B.style.transition === 'none',
      `class=${B.classList.contains('dragging')} transition="${B.style.transition}"`);
    window[KS] = false;
    fm.setupDrag();                                              // recovery
    const earliest = !B.classList.contains('dragging') && B.style.transition === 'all 0.3s';
    note('M20-A', 'kill-stacked-earliest-baseline-restored', earliest,
      `transition="${B.style.transition}" (later binding must not overwrite with "none")`);
    note('M20-A', 'kill-stacked-A-untouched',
      A.style.transition === 'opacity 1s' && !A.classList.contains('dragging'),
      `A.transition="${A.style.transition}"`);
    if (typeof fm.destroy === 'function') fm.destroy();
    note('M20-A', 'kill-stacked-cleanup-idempotent',
      !B.classList.contains('dragging') && B.style.transition === 'all 0.3s',
      `transition="${B.style.transition}" after second pass`);
    hardAssert(earliest, 'stacked bindings must restore the earliest true pre-drag transition');
    A.style.transition = '';
  }

  // 2. Stacked A→B→C: only the actually-touched B restored to earliest baseline.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    fm.setupDrag();                                              // stacked
    const A = census.toolbar;
    A.style.transition = 'opacity 1s';
    const B = census.makeToolbar(null);
    B.style.transition = 'all 0.3s';
    const Cbar = census.makeToolbar(null);
    Cbar.style.transition = 'transform 2s';
    fm.toolbar = B;
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // both touch B
    fm.toolbar = Cbar;                                           // second replacement
    window[KS] = false;
    fm.setupDrag();
    if (typeof fm.destroy === 'function') fm.destroy();
    note('M20-A', 'kill-stacked-abc-B-earliest-baseline',
      !B.classList.contains('dragging') && B.style.transition === 'all 0.3s',
      `transition="${B.style.transition}"`);
    note('M20-A', 'kill-stacked-abc-C-untouched',
      Cbar.style.transition === 'transform 2s' && !Cbar.classList.contains('dragging'),
      `C.transition="${Cbar.style.transition}"`);
    note('M20-A', 'kill-stacked-abc-A-untouched',
      A.style.transition === 'opacity 1s' && !A.classList.contains('dragging'),
      `A.transition="${A.style.transition}"`);
    hardAssert(B.style.transition === 'all 0.3s' && Cbar.style.transition === 'transform 2s',
      'stacked A→B→C: B restored to earliest baseline, C untouched');
    A.style.transition = '';
  }

  // 3. Mouseup terminally resolves the target across ALL stacked bindings:
  //    recovery must not reapply the second binding's captured 'none'.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    fm.setupDrag();                                              // stacked
    const B = census.makeToolbar(null);
    B.style.transition = 'all 0.3s';
    fm.toolbar = B;
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // both bindings touch B
    census.dispatch(census.document, 'mouseup', 100, 100);       // legacy cleans B: transition=''
    const afterMouseUp = B.style.transition;
    window[KS] = false;
    fm.setupDrag();
    if (typeof fm.destroy === 'function') fm.destroy();
    const terminal = afterMouseUp === '' && B.style.transition === ''
      && !B.classList.contains('dragging') && fm.isDragging === false;
    note('M20-A', 'kill-stacked-mouseup-terminal-resolution', terminal,
      `afterMouseUp="${afterMouseUp}" final="${B.style.transition}" (must not re-dirty to "none")`);
    fm.setupDrag();                                              // repeated recovery
    if (typeof fm.destroy === 'function') fm.destroy();
    note('M20-A', 'kill-stacked-mouseup-repeat-idempotent',
      B.style.transition === '' && !B.classList.contains('dragging'),
      `transition="${B.style.transition}" after repeat`);
    hardAssert(terminal, 'mouseup-resolved target must stay resolved across all stacked bindings');
  }

  // 4. Stacked + detached touched target: cleanup survives classList throw and
  //    still restores the earliest baseline transition.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const fm = new C({});
    fm.setupDrag();                                              // stacked
    const B = census.makeToolbar(null);
    B.style.transition = 'all 0.3s';
    fm.toolbar = B;
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    B.classList.remove = () => { throw new Error('detached'); };
    window[KS] = false;
    let survived = true;
    try {
      fm.setupDrag();
      if (typeof fm.destroy === 'function') fm.destroy();
    } catch (_) { survived = false; }
    note('M20-A', 'kill-stacked-detached-cleanup-survives',
      survived && B.style.transition === 'all 0.3s',
      `survived=${survived} transition="${B.style.transition}"`);
    hardAssert(survived, 'stacked detached target must not break recovery');
  }

  window[KS] = false;
});

// ─── Defect 4: shared-target cross-manager visual ownership (leases) ────────
// Fresh-GPT P3 repro: two independent managers X→Y bind/mutate the SAME
// toolbar. The earliest true baseline must be captured once module-wide (Y
// must not capture X's temporary 'none'); releasing X while Y is still active
// must not touch shared visuals; the FINAL owner release restores exactly
// once; a real mouseup terminally resolves the target for every manager.

test('M20-A shared-target leases — cross-manager visual ownership (kill + fix-ON)', () => {
  const Subject = (() => { installDomCensus({}); return loadClassFrom(SUBJECT_PATH); })();
  if (typeof Subject !== 'function') { hardAssert(false, 'subject class missing'); return; }
  const destroySafe = (m) => { if (typeof m.destroy === 'function') { try { m.destroy(); } catch (_) { /* cancel throw */ } } };

  // 1. Kill X→Y (X also stacked): X release preserves peer visuals; final
  //    owner restores the earliest true baseline exactly once.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const X = new C({});
    X.setupDrag();                                               // same-manager stacked
    const Y = new C({});
    const A = census.toolbar;
    A.style.transition = 'all 0.3s';
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // X, X-stacked, Y all fire
    note('M20-A', 'shared-kill-dirty-once',
      A.classList.contains('dragging') && A.style.transition === 'none',
      `class=${A.classList.contains('dragging')} transition="${A.style.transition}"`);
    window[KS] = false;
    X.setupDrag(); destroySafe(X);                               // release X only
    const peerPreserved = A.classList.contains('dragging') && A.style.transition === 'none';
    note('M20-A', 'shared-kill-x-release-preserves-peer-visuals', peerPreserved,
      `class=${A.classList.contains('dragging')} transition="${A.style.transition}" (Y still active)`);
    Y.setupDrag(); destroySafe(Y);                               // final owner
    const finalClean = !A.classList.contains('dragging') && A.style.transition === 'all 0.3s';
    note('M20-A', 'shared-kill-final-owner-restores-baseline', finalClean,
      `transition="${A.style.transition}" (must be earliest baseline, not "none")`);
    note('M20-A', 'shared-kill-owned-sets-empty',
      ((X._favoritesLeasedTargets && X._favoritesLeasedTargets.size) || 0) === 0
      && ((Y._favoritesLeasedTargets && Y._favoritesLeasedTargets.size) || 0) === 0,
    `X=${(X._favoritesLeasedTargets && X._favoritesLeasedTargets.size) || 0} Y=${(Y._favoritesLeasedTargets && Y._favoritesLeasedTargets.size) || 0}`);
    hardAssert(peerPreserved && finalClean,
      'X release must preserve peer visuals; final owner must restore earliest baseline');
    A.style.transition = '';
  }

  // 2. Reversed order: Y constructed first (callbacks fire Y→X), teardown
  //    reversed (second-binder released first). Baseline still correct.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const Y = new C({});                                         // fires first
    const X = new C({});                                         // fires second
    const A = census.toolbar;
    A.style.transition = 'all 0.3s';
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    window[KS] = false;
    X.setupDrag(); destroySafe(X);                               // reversed: second-binder first
    const midDirty = A.classList.contains('dragging') && A.style.transition === 'none';
    Y.setupDrag(); destroySafe(Y);
    note('M20-A', 'shared-kill-reversed-order-correct',
      midDirty && !A.classList.contains('dragging') && A.style.transition === 'all 0.3s',
      `mid=${midDirty} final="${A.style.transition}"`);
    hardAssert(A.style.transition === 'all 0.3s', 'reversed order must still restore true baseline');
    A.style.transition = '';
  }

  // 3. X→Y→Z, teardown permutation Z, X, Y(last): visuals preserved through
  //    every intermediate release, restored exactly once at the end.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const X = new C({});
    const Y = new C({});
    const Z = new C({});
    const A = census.toolbar;
    A.style.transition = 'all 0.3s';
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    window[KS] = false;
    Z.setupDrag(); destroySafe(Z);
    const afterZ = A.classList.contains('dragging') && A.style.transition === 'none';
    X.setupDrag(); destroySafe(X);
    const afterX = A.classList.contains('dragging') && A.style.transition === 'none';
    Y.setupDrag(); destroySafe(Y);
    note('M20-A', 'shared-kill-xyz-permutation-final-restore-once',
      afterZ && afterX && !A.classList.contains('dragging') && A.style.transition === 'all 0.3s',
      `afterZ=${afterZ} afterX=${afterX} final="${A.style.transition}"`);
    hardAssert(afterZ && afterX && A.style.transition === 'all 0.3s',
      'X→Y→Z permutation must preserve visuals until the final release');
    A.style.transition = '';
  }

  // 4. Mouseup is terminal across managers; a fresh drag starts a NEW
  //    baseline epoch and no stale lease survives in the registry.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const X = new C({});
    const Y = new C({});
    const A = census.toolbar;
    A.style.transition = 'all 0.3s';
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    census.dispatch(census.document, 'mouseup', 100, 100);       // legacy cleanup: transition=''
    const afterUp = A.style.transition;
    window[KS] = false;
    X.setupDrag(); destroySafe(X);
    Y.setupDrag(); destroySafe(Y);
    note('M20-A', 'shared-mouseup-terminal-across-managers',
      afterUp === '' && A.style.transition === '' && !A.classList.contains('dragging'),
      `afterUp="${afterUp}" final="${A.style.transition}" (must not re-restore "all 0.3s" or re-dirty)`);
    // New epoch with a different baseline.
    window[KS] = true;
    const E = new C({});
    A.style.transition = 'ease 2s';
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    window[KS] = false;
    E.setupDrag(); destroySafe(E);
    note('M20-A', 'shared-target-new-epoch-baseline',
      A.style.transition === 'ease 2s' && !A.classList.contains('dragging'),
      `transition="${A.style.transition}" (new epoch, not stale "all 0.3s"/"")`);
    hardAssert(A.style.transition === 'ease 2s', 'fresh drag must open a new baseline epoch');
    A.style.transition = '';
  }

  // 5. FIX-ON shared target: X.destroy() while Y drags must not clean shared
  //    visuals; Y.destroy() restores the earliest baseline.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = false;
    const X = new C({});
    const Y = new C({});
    const A = census.toolbar;
    A.style.transition = 'all 0.2s';
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // both fix bindings drag
    note('M20-A', 'shared-fixon-dirty',
      A.classList.contains('dragging') && A.style.transition === 'none',
      `class=${A.classList.contains('dragging')} transition="${A.style.transition}"`);
    destroySafe(X);
    const peerPreserved = A.classList.contains('dragging') && A.style.transition === 'none';
    note('M20-A', 'shared-fixon-x-destroy-preserves-peer', peerPreserved,
      `class=${A.classList.contains('dragging')} transition="${A.style.transition}" (Y still dragging)`);
    destroySafe(Y);
    const finalClean = !A.classList.contains('dragging') && A.style.transition === 'all 0.2s';
    note('M20-A', 'shared-fixon-final-owner-restores', finalClean,
      `transition="${A.style.transition}"`);
    hardAssert(peerPreserved && finalClean,
      'fix-ON: X destroy must preserve peer visuals; final owner restores earliest baseline');
    A.style.transition = '';
  }

  // 6. FIX-ON mouseup restores the EARLIEST baseline (not a later binding's
  //    captured 'none') and terminally resolves for both managers.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = false;
    const X = new C({});
    const Y = new C({});
    const A = census.toolbar;
    A.style.transition = 'all 0.2s';
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    census.dispatch(census.document, 'mouseup', 100, 100);       // both fix mouseups fire
    const afterUp = A.style.transition;
    destroySafe(X);
    destroySafe(Y);
    note('M20-A', 'shared-fixon-mouseup-earliest-baseline',
      afterUp === 'all 0.2s' && A.style.transition === 'all 0.2s' && !A.classList.contains('dragging'),
      `afterUp="${afterUp}" final="${A.style.transition}" (must not be "none")`);
    hardAssert(afterUp === 'all 0.2s' && A.style.transition === 'all 0.2s',
      'fix-ON mouseup must restore the earliest baseline and stay terminal');
    A.style.transition = '';
  }

  // 7. Different targets stay isolated per lease.
  {
    const census = installDomCensus({ deferRaf: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const X = new C({});
    const Y = new C({});
    const A = census.toolbar;
    A.style.transition = 'all 0.3s';
    const B = census.makeToolbar(null);
    B.style.transition = 'opacity 1s';
    Y.toolbar = B;                                               // Y mutates B, X mutates A
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);
    window[KS] = false;
    Y.setupDrag(); destroySafe(Y);
    const yOnly = !B.classList.contains('dragging') && B.style.transition === 'opacity 1s'
      && A.classList.contains('dragging') && A.style.transition === 'none';
    note('M20-A', 'shared-different-targets-isolated', yOnly,
      `B="${B.style.transition}" A="${A.style.transition}"`);
    X.setupDrag(); destroySafe(X);
    note('M20-A', 'shared-different-targets-both-restored',
      A.style.transition === 'all 0.3s' && !A.classList.contains('dragging'),
      `A="${A.style.transition}"`);
    hardAssert(yOnly && A.style.transition === 'all 0.3s',
      'per-target leases must keep different targets isolated');
    A.style.transition = '';
  }

  // 8. Detached final release + cancel-throw during shared teardown.
  {
    const census = installDomCensus({ deferRaf: true, cancelThrows: true });
    const C = loadClassFrom(SUBJECT_PATH);
    window[KS] = true;
    const X = new C({});
    const Y = new C({});
    const B = census.makeToolbar(null);
    B.style.transition = 'all 0.3s';
    X.toolbar = B;
    Y.toolbar = B;
    census.dispatch(census.dragHandle, 'mousedown', 100, 100);   // both mutate B
    census.dispatch(census.document, 'mousemove', 224, 160);     // kill RAFs (cancel throws)
    B.classList.remove = () => { throw new Error('detached'); };
    window[KS] = false;
    let survived = true;
    try {
      X.setupDrag(); destroySafe(X);
      const mid = B.style.transition === 'none';                 // peer still active
      Y.setupDrag(); destroySafe(Y);
      note('M20-A', 'shared-detached-cancel-throw-final-release', mid && B.style.transition === 'all 0.3s',
        `mid="none"=${mid} final="${B.style.transition}"`);
    } catch (_) { survived = false; }
    note('M20-A', 'shared-detached-release-survives', survived);
    hardAssert(survived, 'detached + cancel-throw shared release must not throw');
  }

  window[KS] = false;
});

// ─── Evidence writer (explicit atomic writes only) ──────────────────────────

test('evidence writer atomic contract — same-directory temp, rename, cleanup on interruption', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'm20-a-favorites-atomic-'));
  try {
    const out = path.join(dir, 'evidence.json');
    let tmpSeen = null;
    atomicWriteJsonSync(out, { ok: true }, {
      beforeRename(tmp) {
        tmpSeen = tmp;
        assert.equal(path.dirname(tmp), dir, 'temp file must be in output directory');
        assert.equal(fs.existsSync(out), false, 'final output must not exist before rename');
      },
    });
    assert.equal(JSON.parse(fs.readFileSync(out, 'utf8')).ok, true);
    assert.equal(tmpSeen && fs.existsSync(tmpSeen), false, 'temp file must be gone after rename');

    fs.writeFileSync(out, '{"old":true}\n');
    let failedTmp = null;
    assert.throws(() => atomicWriteJsonSync(out, { ok: false }, {
      beforeRename(tmp) {
        failedTmp = tmp;
        throw new Error('simulated interruption before rename');
      },
    }), /simulated interruption/);
    assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), { old: true },
      'failed atomic write must not replace existing final output');
    assert.equal(failedTmp && fs.existsSync(failedTmp), false,
      'failed atomic write must clean temp output');
    assert.equal(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')).length, 0,
      'no partial temp outputs may remain');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('evidence writer', { skip: !evidenceMode }, () => {
  const suffix = TREE === 'homepage' ? '-homepage' : '';
  const out = path.join(EVIDENCE_DIR, `W4-M20-A-FAVORITES-${STAMP}-${evidenceMode}${suffix}.json`);
  const failed = evidenceRows.filter((r) => !r.pass);

  let verdict;
  if (evidenceMode === 'red') {
    verdict = failed.length ? 'RED' : 'UNEXPECTED-GREEN';
  } else if (evidenceMode === 'kill') {
    const disc = evidenceRows.filter((r) => r.name.startsWith('kill-') || r.name.startsWith('ab-'));
    verdict = disc.length > 0 && disc.every((r) => r.pass) ? 'RED' : 'FAIL-DISCRIMINATION';
  } else {
    verdict = failed.length ? 'FAIL' : 'GREEN';
  }

  const payload = {
    worker: 'W4-FABLE-CORRECTION',
    fix: 'M20-A-FAVORITES',
    mode: evidenceMode,
    tree: TREE,
    stamp: STAMP,
    killSwitch: KS,
    status: evidenceMode === 'green' && verdict === 'GREEN'
      ? 'API-READY-PENDING-CHART-LIFECYCLE' : undefined,
    boardAnchor: 'PLAN3-BOARD M20-A favorites-manager.js drag listener teardown',
    behavioralSubject: {
      path: path.relative(REPO_ROOT, SUBJECT_PATH),
      sha256: sha256File(SUBJECT_PATH),
      isAuthenticPreFix: SUBJECT_PATH === PREFIX_BLOB,
    },
    sourceHashes: {
      'favorites-manager.js (this tree)': sha256File(LOCAL_PRODUCT),
      'favorites-manager.js (other tree)': sha256File(OTHER_PRODUCT),
      'favorites-manager.prefix.js (authentic pre-fix)': sha256File(PREFIX_BLOB),
      'm20-a-favorites-listener-teardown.test.mjs (this file)':
        sha256File(fileURLToPath(import.meta.url)),
    },
    replay: `M20_A_EVIDENCE=${evidenceMode} node --test --test-concurrency=1 "<repo>/${path.relative(REPO_ROOT, fileURLToPath(import.meta.url)).replace(/\\/g, '/')}"`,
    node: process.version,
    generatedAt: new Date().toISOString(),
    rows: evidenceRows,
    summary: {
      total: evidenceRows.length,
      pass: evidenceRows.length - failed.length,
      fail: failed.length,
    },
    verdict,
  };
  atomicWriteJsonSync(out, payload);
  process.stdout.write(`Wrote evidence ${out} verdict=${verdict} rows=${evidenceRows.length}\n`);
});
