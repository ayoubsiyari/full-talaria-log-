/**
 * M20-A favorites harness client — SHIPPED EXECUTABLE BROWSER TEST.
 *
 * Runs in a real Chromium page (real DOM, real events, real RAF) and drives
 * three kinds of subjects in isolated same-origin iframes:
 *   • prefix    — AUTHENTIC pre-fix favorites-manager.js bytes (frozen blob)
 *   • current   — this repo's current product source, fix ON (both trees)
 *   • current+kill — current source with the kill-switch true (both trees)
 *
 * Rows:
 *   RED   — pre-fix defect signatures executed against the authentic bytes
 *   GREEN — teardown/identity/RAF behavior of the current source
 *   KILL  — ordered-behavior A/B: one identical scripted event sequence
 *           against prefix and current+kill; the full ordered behavior logs
 *           must be EQUAL (2 stacked bindings → 2 callbacks, 2 RAFs, same
 *           final styles). This proves observable behavior parity, not
 *           whole-method source equivalence (stack frame names differ).
 *   KILLREC — fresh-GPT defect regressions: kill-period RAF cancelled/inert
 *           through fix-ON recovery/destroy; replaced-toolbar (A→B, A→B→C)
 *           visual state cleaned on the ACTUALLY mutated target only.
 *
 * Results are POSTed to /report; row names/verdicts come only from this
 * executable file.
 */
const KS = '__TALARIA_DISABLE_M20_A_FAVORITES_LISTENER_TEARDOWN_V1';
const PREFIX_URL = '/chart v 1.4/chart/modules/m20-a-favorites-harness/blobs/favorites-manager.prefix.js';
const SUBJECT_URLS = {
  canonical: '/chart v 1.4/chart/modules/favorites-manager.js',
  homepage: '/homepage/public/chart/modules/favorites-manager.js',
};

const rows = [];
function note(q, name, pass, detail = '') {
  rows.push({ q, name, pass: !!pass, detail: String(detail) });
}

async function makeSandbox({ srcUrl, kill }) {
  const iframe = document.createElement('iframe');
  iframe.width = '800';
  iframe.height = '600';
  iframe.style.cssText = 'width:800px;height:600px;border:0;';
  iframe.srcdoc = [
    '<!doctype html><html><head><meta charset="utf-8"></head><body>',
    '<div id="favoritesToolbar" style="position:fixed;left:56px;top:80px;width:240px;height:40px;background:#222">',
    '<div class="favorites-drag-handle" style="width:24px;height:24px;background:#555"></div>',
    '</div>',
    '<div id="favoritesTools"></div>',
    '</body></html>',
  ].join('');
  document.body.appendChild(iframe);
  await new Promise((r) => { iframe.onload = r; });

  const W = iframe.contentWindow;
  const D = W.document;
  W[KS] = kill;
  W.userStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  // Silence product console chatter inside the sandbox.
  W.console.log = () => {};
  W.console.warn = () => {};
  W.console.error = () => {};

  const log = [];
  const census = new Map();
  const spyOf = new Map();
  function instrument(target, label) {
    const origAdd = target.addEventListener.bind(target);
    const origRemove = target.removeEventListener.bind(target);
    target.addEventListener = (type, fn, opts) => {
      let spy = spyOf.get(fn);
      if (!spy) {
        spy = function spyFn(ev) { log.push(`cb:${label}:${type}`); return fn.call(this, ev); };
        spyOf.set(fn, spy);
      }
      const key = `${label}:${type}`;
      if (!census.has(key)) census.set(key, new Set());
      census.get(key).add(spy);
      log.push(`add:${label}:${type}`);
      origAdd(type, spy, opts);
    };
    target.removeEventListener = (type, fn, opts) => {
      const spy = spyOf.get(fn) || fn;
      census.get(`${label}:${type}`)?.delete(spy);
      log.push(`remove:${label}:${type}`);
      origRemove(type, spy, opts);
    };
  }
  const toolbar = D.getElementById('favoritesToolbar');
  const handle = D.querySelector('.favorites-drag-handle');
  instrument(D, 'document');
  instrument(handle, 'handle');

  const origRaf = W.requestAnimationFrame.bind(W);
  const origCaf = W.cancelAnimationFrame.bind(W);
  const rafStats = { scheduled: 0, ran: 0, cancelled: 0 };
  W.requestAnimationFrame = (fn) => {
    rafStats.scheduled += 1;
    log.push('raf:schedule');
    return origRaf((t) => { rafStats.ran += 1; log.push('raf:run'); fn(t); });
  };
  W.cancelAnimationFrame = (id) => {
    rafStats.cancelled += 1;
    log.push('raf:cancel');
    return origCaf(id);
  };

  await new Promise((resolve, reject) => {
    const s = D.createElement('script');
    s.src = encodeURI(srcUrl);
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${srcUrl}`));
    D.body.appendChild(s);
  });

  const count = (label, type) => census.get(`${label}:${type}`)?.size || 0;
  const mouse = (type, x, y) => new W.MouseEvent(type, {
    clientX: x, clientY: y, bubbles: true, cancelable: true, view: W,
  });
  const nextFrames = (n = 2) => new Promise((resolve) => {
    let left = n;
    const tick = () => { left -= 1; if (left <= 0) resolve(); else origRaf(tick); };
    origRaf(tick);
  });

  return {
    W, D, toolbar, handle, log, census, count, mouse, nextFrames, rafStats,
    remove: () => iframe.remove(),
  };
}

/** Identical scripted event sequence for the exact-kill A/B. */
async function runKillScript(sb) {
  const FM = sb.W.FavoritesManager;
  sb.log.push(`export:${typeof FM}`);
  const fm = new FM({});
  fm.setupDrag(); // stacked second binding — legacy must stack, never dedupe
  sb.log.push(`count:move=${sb.count('document', 'mousemove')}:up=${sb.count('document', 'mouseup')}:down=${sb.count('handle', 'mousedown')}`);

  sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100));
  sb.log.push(`state:isDragging=${fm.isDragging}`);
  sb.D.dispatchEvent(sb.mouse('mousemove', 150, 130));
  sb.D.dispatchEvent(sb.mouse('mousemove', 180, 140));
  sb.log.push(`raf:scheduled=${sb.rafStats.scheduled}`);
  await sb.nextFrames(2);
  sb.log.push(`raf:ran=${sb.rafStats.ran}`);
  sb.log.push(`style:final=${sb.toolbar.style.left},${sb.toolbar.style.top}`);
  sb.D.dispatchEvent(sb.mouse('mouseup', 180, 140));
  sb.log.push(`state:isDragging=${fm.isDragging}`);
  sb.log.push(`class:dragging=${sb.toolbar.classList.contains('dragging')}`);

  // Stale-binding probes: the OLDEST stacked binding must still execute.
  sb.handle.dispatchEvent(sb.mouse('mousedown', 90, 90));
  sb.log.push(`probe:restack:isDragging=${fm.isDragging}`);
  sb.log.push(`probe:cb:down=${sb.log.filter((l) => l === 'cb:handle:mousedown').length}`);
  sb.D.dispatchEvent(sb.mouse('mouseup', 90, 90));
  sb.log.push(`probe:after-up:isDragging=${fm.isDragging}`);
  return fm;
}

async function redSuite(tree) {
  const sb = await makeSandbox({ srcUrl: PREFIX_URL, kill: false });
  try {
    const FM = sb.W.FavoritesManager;
    note('RED', `prefix-loadable[${tree}]`, typeof FM === 'function');
    const fm = new FM({});
    const base = { move: sb.count('document', 'mousemove'), down: sb.count('handle', 'mousedown') };
    note('RED', 'prefix-constructor-installs-pair', base.move === 1 && base.down === 1,
      `move=${base.move} down=${base.down}`);
    fm.setupDrag();
    note('RED', 'prefix-reinit-stacks', sb.count('document', 'mousemove') === 2
      && sb.count('handle', 'mousedown') === 2,
    `move=${sb.count('document', 'mousemove')} down=${sb.count('handle', 'mousedown')}`);
    note('RED', 'prefix-destroy-absent', typeof fm.destroy !== 'function');
    note('RED', 'prefix-teardown-helper-absent', typeof fm._teardownDragBindings !== 'function');

    sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100));
    const downCbs = sb.log.filter((l) => l === 'cb:handle:mousedown').length;
    note('RED', 'prefix-two-bindings-two-mousedown-callbacks', downCbs === 2, `cbs=${downCbs}`);
    const leftBeforeMove = sb.toolbar.style.left;
    sb.D.dispatchEvent(sb.mouse('mousemove', 150, 130));
    note('RED', 'prefix-two-bindings-two-rafs', sb.rafStats.scheduled === 2,
      `scheduled=${sb.rafStats.scheduled}`);
    await sb.nextFrames(2);
    note('RED', 'prefix-raf-applies-style', sb.toolbar.style.left !== leftBeforeMove,
      `left ${leftBeforeMove} -> ${sb.toolbar.style.left}`);
    sb.D.dispatchEvent(sb.mouse('mouseup', 150, 130));
    note('RED', 'prefix-no-way-to-drain', sb.count('document', 'mousemove') === 2,
      `move=${sb.count('document', 'mousemove')}`);
  } catch (err) {
    note('RED', 'prefix-suite-exception', false, String(err && err.stack || err));
  } finally {
    sb.remove();
  }
}

async function greenSuite(tree) {
  const sb = await makeSandbox({ srcUrl: SUBJECT_URLS[tree], kill: false });
  try {
    const FM = sb.W.FavoritesManager;
    note('GREEN', `current-loadable[${tree}]`, typeof FM === 'function');
    const fm = new FM({});
    note('GREEN', `current-constructor-single-pair[${tree}]`,
      sb.count('document', 'mousemove') === 1 && sb.count('handle', 'mousedown') === 1,
      `move=${sb.count('document', 'mousemove')} down=${sb.count('handle', 'mousedown')}`);
    for (let i = 0; i < 100; i += 1) fm.setupDrag();
    note('GREEN', `current-100-reinit-flat[${tree}]`,
      sb.count('document', 'mousemove') === 1 && sb.count('handle', 'mousedown') === 1,
      `move=${sb.count('document', 'mousemove')}`);

    // Active drag in a real DOM, destroy mid-drag.
    sb.toolbar.style.transition = 'all 0.2s';
    // CSSOM re-serializes shorthand values; compare against the browser's own
    // serialization of what we set, not the literal input string.
    const preDragTransition = sb.toolbar.style.transition;
    sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100));
    note('GREEN', `current-real-drag-marks-class[${tree}]`,
      sb.toolbar.classList.contains('dragging') && fm.isDragging === true);
    sb.D.dispatchEvent(sb.mouse('mousemove', 150, 130)); // pending RAF
    const leftBefore = sb.toolbar.style.left;
    fm.destroy();
    note('GREEN', `current-destroy-mid-drag-cleans[${tree}]`,
      !sb.toolbar.classList.contains('dragging')
      && sb.toolbar.style.transition === preDragTransition
      && fm.isDragging === false,
    `class=${sb.toolbar.classList.contains('dragging')} transition="${sb.toolbar.style.transition}" expected="${preDragTransition}"`);
    note('GREEN', `current-destroy-drains-all[${tree}]`,
      sb.count('document', 'mousemove') === 0 && sb.count('document', 'mouseup') === 0
      && sb.count('handle', 'mousedown') === 0,
    `move=${sb.count('document', 'mousemove')} down=${sb.count('handle', 'mousedown')}`);
    await sb.nextFrames(2);
    note('GREEN', `current-stale-raf-no-mutation[${tree}]`,
      sb.toolbar.style.left === leftBefore, `left=${sb.toolbar.style.left}`);

    // ON→OFF→ON recovery in a real DOM.
    fm.toolbar = sb.toolbar;
    sb.W[KS] = true;
    fm.setupDrag();
    fm.setupDrag();
    const offMove = sb.count('document', 'mousemove');
    sb.W[KS] = false;
    fm.setupDrag();
    fm.destroy();
    note('GREEN', `current-on-off-on-recovery[${tree}]`,
      offMove === 2 && sb.count('document', 'mousemove') === 0,
      `off=${offMove} final=${sb.count('document', 'mousemove')}`);
  } catch (err) {
    note('GREEN', `current-suite-exception[${tree}]`, false, String(err && err.stack || err));
  } finally {
    sb.remove();
  }
}

async function killAbSuite(tree) {
  const a = await makeSandbox({ srcUrl: PREFIX_URL, kill: false });
  const b = await makeSandbox({ srcUrl: SUBJECT_URLS[tree], kill: true });
  let logA = [];
  let logB = [];
  try {
    await runKillScript(a);
    await runKillScript(b);
    logA = a.log.slice();
    logB = b.log.slice();
    const equal = JSON.stringify(logA) === JSON.stringify(logB);
    let firstDiff = '';
    if (!equal) {
      const max = Math.max(logA.length, logB.length);
      for (let i = 0; i < max; i += 1) {
        if (logA[i] !== logB[i]) { firstDiff = `#${i}: prefix="${logA[i]}" vs kill="${logB[i]}"`; break; }
      }
    }
    note('KILL', `ab-log-exact-match[${tree}]`, equal,
      equal ? `${logA.length} entries` : firstDiff);
    note('KILL', `ab-two-bindings-two-rafs[${tree}]`,
      logA.includes('raf:scheduled=2') && logB.includes('raf:scheduled=2'));
    note('KILL', `ab-both-rafs-ran[${tree}]`,
      logA.includes('raf:ran=2') && logB.includes('raf:ran=2'));
    note('KILL', `ab-stale-binding-still-fires[${tree}]`,
      logA.includes('probe:cb:down=4') && logB.includes('probe:cb:down=4'),
      `A=${logA.find((l) => l.startsWith('probe:cb:down'))} B=${logB.find((l) => l.startsWith('probe:cb:down'))}`);
  } catch (err) {
    note('KILL', `ab-suite-exception[${tree}]`, false, String(err && err.stack || err));
  } finally {
    a.remove();
    b.remove();
  }
  return { logA, logB };
}

/**
 * Kill-recovery regressions (fresh-GPT defects) in a real DOM:
 *   1. a kill-period RAF must not survive fix-ON recovery + destroy;
 *   2. recovery/destroy must clean the toolbar ACTUALLY mutated by a legacy
 *      callback after `this.toolbar` replacement (A→B, A→B→C), and must not
 *      touch never-mutated toolbars.
 */
async function killRecoverySuite(tree) {
  const sb = await makeSandbox({ srcUrl: SUBJECT_URLS[tree], kill: true });
  try {
    const FM = sb.W.FavoritesManager;

    // 1. Kill RAF vs recovery/destroy — all synchronous before any frame.
    {
      const fm = new FM({});
      sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100));
      sb.D.dispatchEvent(sb.mouse('mousemove', 224, 160)); // schedules kill RAF
      const scheduled = sb.rafStats.scheduled;
      const leftBefore = sb.toolbar.style.left;
      const topBefore = sb.toolbar.style.top;
      sb.W[KS] = false;
      fm.setupDrag();  // fix-ON recovery (cancels the kill RAF)
      fm.destroy();
      await sb.nextFrames(3); // delayed/native flush window
      note('KILLREC', `kill-raf-recovery-no-style-write[${tree}]`,
        sb.toolbar.style.left === leftBefore && sb.toolbar.style.top === topBefore,
        `left=${sb.toolbar.style.left} top=${sb.toolbar.style.top} (before ${leftBefore}/${topBefore})`);
      note('KILLREC', `kill-raf-not-run-after-recovery[${tree}]`,
        scheduled === 1 && sb.rafStats.ran === 0 && sb.rafStats.cancelled >= 1,
        `scheduled=${scheduled} ran=${sb.rafStats.ran} cancelled=${sb.rafStats.cancelled}`);
      note('KILLREC', `kill-recovery-counts-zero[${tree}]`,
        sb.count('document', 'mousemove') === 0 && sb.count('document', 'mouseup') === 0
        && sb.count('handle', 'mousedown') === 0,
      `move=${sb.count('document', 'mousemove')} down=${sb.count('handle', 'mousedown')}`);
    }

    // 2. Replaced-toolbar A→B: old handle mousedown mutates B; recovery must
    //    clean B and leave the original toolbar untouched. Second destroy
    //    pass must be idempotent.
    {
      sb.W[KS] = true;
      const fm = new FM({});
      const B = sb.D.createElement('div');
      B.style.cssText = 'position:fixed;left:10px;top:10px;width:100px;height:20px;transition:all 0.3s;';
      sb.D.body.appendChild(B);
      const preB = B.style.transition; // browser-serialized pre-drag value
      const preA = sb.toolbar.style.transition;
      fm.toolbar = B; // dynamic replacement — no drag handle inside B
      sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100)); // mutates B
      note('KILLREC', `kill-replaced-toolbar-dirty[${tree}]`,
        B.classList.contains('dragging') && B.style.transition !== preB,
        `class=${B.classList.contains('dragging')} transition="${B.style.transition}"`);
      sb.W[KS] = false;
      fm.setupDrag(); // recovery + early return (B has no handle)
      note('KILLREC', `kill-recovery-cleans-actual-target[${tree}]`,
        !B.classList.contains('dragging') && B.style.transition === preB,
        `class=${B.classList.contains('dragging')} transition="${B.style.transition}" expected="${preB}"`);
      note('KILLREC', `kill-recovery-leaves-original-untouched[${tree}]`,
        sb.toolbar.style.transition === preA && !sb.toolbar.classList.contains('dragging'),
        `transition="${sb.toolbar.style.transition}"`);
      fm.destroy();
      note('KILLREC', `kill-target-cleanup-idempotent[${tree}]`,
        !B.classList.contains('dragging') && B.style.transition === preB,
        `transition="${B.style.transition}" after second pass`);
    }

    // 3. A→B→C: only the actually-touched B is cleaned; C stays untouched.
    {
      sb.W[KS] = true;
      const fm = new FM({});
      const B = sb.D.createElement('div');
      B.style.cssText = 'position:fixed;left:10px;top:40px;transition:opacity 1s;';
      sb.D.body.appendChild(B);
      const C = sb.D.createElement('div');
      C.style.cssText = 'position:fixed;left:10px;top:70px;transition:transform 2s;';
      sb.D.body.appendChild(C);
      const preB = B.style.transition;
      const preC = C.style.transition;
      fm.toolbar = B;
      sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100)); // touches B
      fm.toolbar = C; // second replacement before recovery
      sb.W[KS] = false;
      fm.setupDrag();
      fm.destroy();
      note('KILLREC', `kill-abc-only-touched-cleaned[${tree}]`,
        !B.classList.contains('dragging') && B.style.transition === preB
        && !C.classList.contains('dragging') && C.style.transition === preC,
      `B="${B.style.transition}" C="${C.style.transition}"`);
    }

    // 4. STACKED kill bindings, native listener order, one replacement
    //    toolbar: the later binding must not capture the dirty 'none' and
    //    overwrite the earliest true pre-drag transition at recovery.
    {
      sb.W[KS] = true;
      const fm = new FM({});
      fm.setupDrag(); // second stacked kill binding on the same handle
      const B = sb.D.createElement('div');
      B.style.cssText = 'position:fixed;left:10px;top:100px;transition:all 0.3s;';
      sb.D.body.appendChild(B);
      const preB = B.style.transition;
      const preA = sb.toolbar.style.transition;
      fm.toolbar = B;
      sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100)); // BOTH bindings fire natively
      note('KILLREC', `kill-stacked-dirty[${tree}]`,
        B.classList.contains('dragging') && B.style.transition !== preB,
        `transition="${B.style.transition}"`);
      sb.W[KS] = false;
      fm.setupDrag(); // recovery
      note('KILLREC', `kill-stacked-earliest-baseline[${tree}]`,
        !B.classList.contains('dragging') && B.style.transition === preB,
        `transition="${B.style.transition}" expected="${preB}"`);
      note('KILLREC', `kill-stacked-original-untouched[${tree}]`,
        sb.toolbar.style.transition === preA && !sb.toolbar.classList.contains('dragging'),
        `transition="${sb.toolbar.style.transition}"`);
      fm.destroy();
      note('KILLREC', `kill-stacked-cleanup-idempotent[${tree}]`,
        !B.classList.contains('dragging') && B.style.transition === preB,
        `transition="${B.style.transition}" after second pass`);
    }

    // 5. Mouseup terminally resolves the target across all stacked bindings:
    //    recovery must not reapply a captured 'none' over legacy's cleanup.
    {
      sb.W[KS] = true;
      const fm = new FM({});
      fm.setupDrag(); // stacked
      const B = sb.D.createElement('div');
      B.style.cssText = 'position:fixed;left:10px;top:130px;transition:all 0.3s;';
      sb.D.body.appendChild(B);
      fm.toolbar = B;
      sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100)); // both bindings touch B
      sb.D.dispatchEvent(sb.mouse('mouseup', 100, 100)); // legacy cleans B: transition=''
      const afterMouseUp = B.style.transition;
      sb.W[KS] = false;
      fm.setupDrag();
      fm.destroy();
      note('KILLREC', `kill-stacked-mouseup-terminal[${tree}]`,
        afterMouseUp === '' && B.style.transition === '' && !B.classList.contains('dragging'),
        `afterMouseUp="${afterMouseUp}" final="${B.style.transition}"`);
      fm.setupDrag(); // repeated recovery stays clean
      fm.destroy();
      note('KILLREC', `kill-stacked-mouseup-repeat-idempotent[${tree}]`,
        B.style.transition === '' && !B.classList.contains('dragging'),
        `transition="${B.style.transition}" after repeat`);
    }
  } catch (err) {
    note('KILLREC', `kill-recovery-suite-exception[${tree}]`, false, String(err && err.stack || err));
  } finally {
    sb.remove();
  }
}

async function sharedLeaseSuite(tree) {
  const destroySafe = (fm) => {
    try { if (typeof fm.destroy === 'function') fm.destroy(); } catch (_) { /* cancel/detach safe */ }
  };
  const setTransition = (el, value) => {
    el.style.transition = value;
    return el.style.transition; // browser-serialized value
  };

  // 1. KILL X/Y/Z: every intermediate release preserves peer visuals; final
  // owner restores the earliest true baseline.
  {
    const sb = await makeSandbox({ srcUrl: SUBJECT_URLS[tree], kill: true });
    try {
      const FM = sb.W.FavoritesManager;
      const X = new FM({});
      const Y = new FM({});
      const Z = new FM({});
      const pre = setTransition(sb.toolbar, 'all 0.3s');
      sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100));
      sb.W[KS] = false;
      Z.setupDrag(); destroySafe(Z);
      const afterZ = sb.toolbar.classList.contains('dragging') && sb.toolbar.style.transition !== pre;
      X.setupDrag(); destroySafe(X);
      const afterX = sb.toolbar.classList.contains('dragging') && sb.toolbar.style.transition !== pre;
      Y.setupDrag(); destroySafe(Y);
      note('SHARED', `kill-xyz-intermediate-preserved-final-restored[${tree}]`,
        afterZ && afterX && !sb.toolbar.classList.contains('dragging') && sb.toolbar.style.transition === pre,
        `afterZ=${afterZ} afterX=${afterX} final="${sb.toolbar.style.transition}" expected="${pre}"`);
      note('SHARED', `kill-xyz-zero-residual-owners[${tree}]`,
        ((X._favoritesLeasedTargets && X._favoritesLeasedTargets.size) || 0) === 0
        && ((Y._favoritesLeasedTargets && Y._favoritesLeasedTargets.size) || 0) === 0
        && ((Z._favoritesLeasedTargets && Z._favoritesLeasedTargets.size) || 0) === 0);
    } catch (err) {
      note('SHARED', `kill-xyz-suite-exception[${tree}]`, false, String(err && err.stack || err));
    } finally {
      sb.remove();
    }
  }

  // 2. KILL mouseup terminally resolves every manager; a later recovery cannot
  // reapply stale baselines over legacy's own visual end state.
  {
    const sb = await makeSandbox({ srcUrl: SUBJECT_URLS[tree], kill: true });
    try {
      const FM = sb.W.FavoritesManager;
      const X = new FM({});
      const Y = new FM({});
      setTransition(sb.toolbar, 'all 0.3s');
      sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100));
      sb.D.dispatchEvent(sb.mouse('mouseup', 100, 100));
      const afterUp = sb.toolbar.style.transition;
      sb.W[KS] = false;
      X.setupDrag(); destroySafe(X);
      Y.setupDrag(); destroySafe(Y);
      note('SHARED', `kill-mouseup-terminal-across-managers[${tree}]`,
        afterUp === '' && sb.toolbar.style.transition === '' && !sb.toolbar.classList.contains('dragging'),
        `afterUp="${afterUp}" final="${sb.toolbar.style.transition}"`);
    } catch (err) {
      note('SHARED', `kill-mouseup-suite-exception[${tree}]`, false, String(err && err.stack || err));
    } finally {
      sb.remove();
    }
  }

  // 3. FIX-ON X/Y: destroying X while Y remains active cannot restore shared
  // visuals; the final owner restores the earliest baseline.
  {
    const sb = await makeSandbox({ srcUrl: SUBJECT_URLS[tree], kill: false });
    try {
      const FM = sb.W.FavoritesManager;
      const X = new FM({});
      const Y = new FM({});
      const pre = setTransition(sb.toolbar, 'all 0.2s');
      sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100));
      destroySafe(X);
      const mid = sb.toolbar.classList.contains('dragging') && sb.toolbar.style.transition !== pre;
      destroySafe(Y);
      note('SHARED', `fixon-x-release-preserves-y-final-restores[${tree}]`,
        mid && !sb.toolbar.classList.contains('dragging') && sb.toolbar.style.transition === pre,
        `mid=${mid} final="${sb.toolbar.style.transition}" expected="${pre}"`);
    } catch (err) {
      note('SHARED', `fixon-suite-exception[${tree}]`, false, String(err && err.stack || err));
    } finally {
      sb.remove();
    }
  }

  // 4. KILL different targets stay isolated per document-local target lease.
  {
    const sb = await makeSandbox({ srcUrl: SUBJECT_URLS[tree], kill: true });
    try {
      const FM = sb.W.FavoritesManager;
      const X = new FM({});
      const Y = new FM({});
      const preA = setTransition(sb.toolbar, 'all 0.3s');
      const B = sb.D.createElement('div');
      B.style.cssText = 'position:fixed;left:10px;top:160px;width:100px;height:20px;transition:opacity 1s;';
      sb.D.body.appendChild(B);
      const preB = B.style.transition;
      Y.toolbar = B;
      sb.handle.dispatchEvent(sb.mouse('mousedown', 100, 100));
      sb.W[KS] = false;
      Y.setupDrag(); destroySafe(Y);
      const yOnly = !B.classList.contains('dragging') && B.style.transition === preB
        && sb.toolbar.classList.contains('dragging') && sb.toolbar.style.transition !== preA;
      X.setupDrag(); destroySafe(X);
      note('SHARED', `kill-different-targets-isolated[${tree}]`,
        yOnly && !sb.toolbar.classList.contains('dragging') && sb.toolbar.style.transition === preA,
        `yOnly=${yOnly} A="${sb.toolbar.style.transition}" B="${B.style.transition}"`);
    } catch (err) {
      note('SHARED', `kill-different-targets-suite-exception[${tree}]`, false, String(err && err.stack || err));
    } finally {
      sb.remove();
    }
  }
}

(async () => {
  const abLogs = {};
  try {
    for (const tree of ['canonical', 'homepage']) {
      await redSuite(tree);
      await greenSuite(tree);
      abLogs[tree] = await killAbSuite(tree);
      await killRecoverySuite(tree);
      await sharedLeaseSuite(tree);
    }
  } catch (err) {
    note('HARNESS', 'unhandled-exception', false, String(err && err.stack || err));
  }
  const failed = rows.filter((r) => !r.pass);
  const report = {
    harness: 'M20-A-FAVORITES-BROWSER',
    userAgent: navigator.userAgent,
    rows,
    abLogs,
    pass: rows.length - failed.length,
    fail: failed.length,
    verdict: failed.length === 0 ? 'HARNESS-PASS' : 'HARNESS-FAIL',
  };
  document.getElementById('status').textContent = JSON.stringify(report, null, 2);
  try {
    await fetch('/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(report),
    });
  } catch (_) { /* runner also times out */ }
})();
