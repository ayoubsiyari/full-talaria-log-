#!/usr/bin/env node
/**
 * SR-02 RESIZE-01 harness: panel viewport-resize propagation.
 *
 * WHAT THIS MEASURES, AND HOW IT IS BOUND TO THE REAL FILE
 * -------------------------------------------------------
 * There is no browser in this lane (the heavy-measurement lock is held by
 * another manager and a soak is running), so this harness does not boot a
 * chart. Instead every behavioural cell is driven by facts EXTRACTED FROM THE
 * REAL chart.js ON DISK by AST:
 *
 *   - whether a `window.addEventListener('resize', ...)` registration is
 *     reachable when `this.isPanel === true`
 *   - whether the kill-switch is read INSIDE the handler body (per call) rather
 *     than at registration time
 *   - the actual early-return predicate of Chart.resize()
 *
 * The simulation is then wired from those extracted facts. That is what gives
 * the behavioural cells teeth on the shipped bytes: mutating chart.js on disk
 * changes the extracted facts and flips a named cell. The mutant battery in
 * sr02-mutants.mjs is the proof of that claim.
 *
 * Measured defect being gated (sibling lane, real viewport change):
 *   instance B CSS box reflowed 791x849 -> 449x700 while its canvas backing
 *   store stayed 791x849, painting at the old resolution into a smaller box.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

export const SIGNATURE = 'TALARIA_SR02_RESIZE_PROPAGATION_V1';
export const SWITCH_NAME = '__TALARIA_DISABLE_PANEL_VIEWPORT_RESIZE_V1';

// The needle the mutant battery targets. If a mutant edits a line that no
// longer contains this, the runner must say NOT_APPLIED loudly rather than
// silently passing.
export const NEEDLES = Object.freeze({
  panelResizeRegistration: "window.addEventListener('resize', this._handleViewportRefresh)",
  earlyReturn: '!sizeChanged && !dprChanged && !bufMismatch',
  switchRead: SWITCH_NAME,
});

// ───────────────────────── source extraction ─────────────────────────

function nodesIn(root) {
  const out = [];
  (function rec(n) {
    if (!n || typeof n.type !== 'string') return;
    out.push(n);
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = n[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') rec(x); }
      else if (v && typeof v.type === 'string') rec(v);
    }
  })(root);
  return out;
}

/**
 * Flatten a `&&` chain into its conjuncts. `if (!this.isPanel && X)` gates just
 * as hard as `if (!this.isPanel)`, so the reachability test must see inside the
 * conjunction — a detector that only matched the bare UnaryExpression would let
 * a mutant move the registration under the host arm undetected.
 */
function conjuncts(test) {
  if (!test) return [];
  if (test.type === 'LogicalExpression' && test.operator === '&&') {
    return [...conjuncts(test.left), ...conjuncts(test.right)];
  }
  return [test];
}

const isThisIsPanel = (n) => !!n && n.type === 'MemberExpression'
  && n.object.type === 'ThisExpression'
  && n.property && n.property.name === 'isPanel';

/** Does `test` require `!this.isPanel` (host-only)? */
function isNotIsPanel(test) {
  return conjuncts(test).some((c) => c.type === 'UnaryExpression' && c.operator === '!'
    && isThisIsPanel(c.argument));
}

/** Does `test` require `this.isPanel` (panel-only)? */
function mentionsIsPanelPositively(test) {
  return conjuncts(test).some((c) => isThisIsPanel(c));
}

export function extractFacts(chartJsPath) {
  const src = fs.readFileSync(chartJsPath, 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true });

  const registrations = [];

  // Walk with a parent stack so we can test reachability under `isPanel`.
  (function visit(node, stack) {
    if (!node || typeof node.type !== 'string') return;

    if (node.type === 'CallExpression'
      && node.callee.type === 'MemberExpression'
      && node.callee.object.type === 'Identifier'
      && node.callee.object.name === 'window'
      && node.callee.property && node.callee.property.name === 'addEventListener'
      && node.arguments[0] && node.arguments[0].type === 'Literal'
      && node.arguments[0].value === 'resize') {

      // Reachability: is this registration inside the consequent of an
      // `if (!this.isPanel)`, i.e. host-only?
      let hostOnly = false;
      let panelGuarded = false;
      for (let i = stack.length - 1; i >= 0; i--) {
        const s = stack[i];
        if (s.type !== 'IfStatement') continue;
        const child = stack[i + 1];
        const inConsequent = child === s.consequent;
        const inAlternate = child === s.alternate;
        if (isNotIsPanel(s.test) && inConsequent) hostOnly = true;
        if (isNotIsPanel(s.test) && inAlternate) panelGuarded = true;
        if (mentionsIsPanelPositively(s.test) && !isNotIsPanel(s.test) && inConsequent) panelGuarded = true;
      }

      // The handler argument: does its body read the kill-switch per call?
      const handlerArg = node.arguments[1];
      let handlerName = handlerArg && handlerArg.type === 'MemberExpression'
        ? `this.${handlerArg.property.name}` : '(inline)';

      registrations.push({
        line: node.loc.start.line,
        hostOnly,
        panelGuarded,
        reachableForPanels: !hostOnly,
        handler: handlerName,
      });
    }

    stack.push(node);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') visit(x, stack); }
      else if (v && typeof v.type === 'string') visit(v, stack);
    }
    stack.pop();
  })(ast, []);

  // Chart.resize()'s early-return. A substring check is NOT enough: prefixing
  // the test with `false &&` leaves the substring intact while destroying the
  // guard, so decompose the conjunction and require exactly the three expected
  // negations. The simulation below is wired to this fact, so a mutant that
  // defeats the guard in source also defeats it in the simulation.
  let earlyReturnConjuncts = null;
  const resizeMethod = nodesIn(ast).find((n) => n.type === 'MethodDefinition'
    && n.key && n.key.name === 'resize');
  if (resizeMethod) {
    for (const n of nodesIn(resizeMethod)) {
      if (n.type !== 'IfStatement') continue;
      const txt = src.slice(n.test.start, n.test.end);
      if (!/sizeChanged/.test(txt) || !/dprChanged/.test(txt) || !/bufMismatch/.test(txt)) continue;
      const body = n.consequent.type === 'BlockStatement' ? n.consequent.body : [n.consequent];
      const bareReturn = body.length === 1 && body[0].type === 'ReturnStatement' && !body[0].argument;
      if (!bareReturn) continue;
      const parts = [];
      (function flat(t) {
        if (t.type === 'LogicalExpression' && t.operator === '&&') { flat(t.left); flat(t.right); return; }
        parts.push(src.slice(t.start, t.end).trim());
      })(n.test);
      earlyReturnConjuncts = parts;
      break;
    }
  }
  const EXPECTED_CONJUNCTS = ['!sizeChanged', '!dprChanged', '!bufMismatch'];
  const earlyReturnIntact = !!earlyReturnConjuncts
    && earlyReturnConjuncts.length === EXPECTED_CONJUNCTS.length
    && EXPECTED_CONJUNCTS.every((c, i) => earlyReturnConjuncts[i] === c);

  // Kill-switch: must be READ INSIDE a function body, so each invocation
  // re-reads it. A read at registration time cannot be flipped mid-session.
  const switchReads = [];
  for (const n of nodesIn(ast)) {
    if (n.type === 'MemberExpression' && !n.computed
      && n.property && n.property.name === SWITCH_NAME) {
      switchReads.push({ line: n.loc ? n.loc.start.line : null });
    }
  }
  // Strict-equality misuse: `=== true` / `!== true` against the switch is the
  // defect class already found in shipped switches here.
  const strictTrueComparison = new RegExp(
    `${SWITCH_NAME}\\s*(===|!==)\\s*true|true\\s*(===|!==)\\s*${SWITCH_NAME}`,
  ).test(src);

  return {
    chartJsPath,
    bytes: src.length,
    registrations,
    panelResizeRegistered: registrations.some((r) => r.reachableForPanels),
    hostResizeRegistered: registrations.some((r) => r.hostOnly || r.reachableForPanels),
    switchReadCount: switchReads.length,
    switchReadPresent: switchReads.length > 0,
    strictTrueComparison,
    // needle presence, for NOT_APPLIED detection by the mutant runner
    needles: Object.fromEntries(Object.entries(NEEDLES).map(([k, v]) => [k, src.includes(v)])),
    earlyReturnConjuncts,
    earlyReturnIntact,
  };
}

// ───────────────────────── simulation ─────────────────────────
// Wired from the extracted facts. `Chart.resize()` reproduces the real
// early-return at chart.js:19643-19645 (sizeChanged || dprChanged ||
// bufMismatch) so a synthetic resize that changes nothing measures nothing.

function makeInstance(facts, { isPanel, w, h, dpr = 1 }) {
  return {
    isPanel,
    w, h, dpr,
    cssBox: { w, h },
    backingStore: { w: Math.floor(w * dpr), h: Math.floor(h * dpr) },
    _lastResizeDpr: dpr,
    renders: 0,
    resizeCalls: 0,
    resizeEarlyReturns: 0,
    // input plumbing, for the FLAG-03 working-product arm
    canvasRect: { left: 0, top: 0, width: w, height: h },
    mouseX: null, mouseY: null,
    keyEvents: 0,
    crosshair: null,
  };
}

/**
 * Faithful port of Chart.resize()'s guard. Returns true if it did work.
 *
 * The early-return is taken only when the real source still has it intact
 * (facts.earlyReturnIntact, decomposed by AST). That wiring is deliberate: a
 * mutant that defeats the guard in chart.js makes this simulation do work on a
 * no-op resize, which the RESIZE-NOOP-MEASURES-NOTHING cell then catches.
 */
function resize(inst, facts) {
  inst.resizeCalls += 1;
  const nextW = inst.cssBox.w;
  const nextH = inst.cssBox.h;
  const dpr = inst.dpr;
  if (nextW < 2 || nextH < 2) return false;
  const sizeChanged = inst.w !== nextW || inst.h !== nextH;
  const dprChanged = inst._lastResizeDpr !== dpr;
  const bufMismatch = Math.abs(inst.backingStore.w - Math.floor(nextW * dpr)) > 1
    || Math.abs(inst.backingStore.h - Math.floor(nextH * dpr)) > 1;
  if (facts.earlyReturnIntact && !sizeChanged && !dprChanged && !bufMismatch) {
    inst.resizeEarlyReturns += 1;
    return false;
  }
  inst._lastResizeDpr = dpr;
  inst.w = nextW;
  inst.h = nextH;
  inst.backingStore = { w: Math.floor(nextW * dpr), h: Math.floor(nextH * dpr) };
  inst.canvasRect = { ...inst.canvasRect, width: nextW, height: nextH };
  inst.renders += 1;
  return true;
}

/**
 * The realm: one window, N instances. `dispatchWindowResize` mirrors what the
 * browser does — one event, delivered to every registered listener.
 */
function makeRealm(facts, switchValue = undefined) {
  const listeners = [];
  const realm = {
    switchValue,
    instances: [],
    add(inst) {
      realm.instances.push(inst);
      // THE FACT UNDER TEST: is a window resize listener installed for this
      // instance? Host always; panel only if the real source registers one on a
      // path reachable when isPanel is true.
      const shouldRegister = inst.isPanel ? facts.panelResizeRegistered : facts.hostResizeRegistered;
      if (!shouldRegister) return;
      listeners.push(() => {
        // Kill-switch read PER CALL (truthy-disabling), matching the shipped
        // handler. Extracted requirement: facts.switchReadPresent.
        if (inst.isPanel && facts.switchReadPresent && realm.switchValue) return;
        resize(inst, facts);
      });
    },
    dispatchWindowResize() { for (const fn of listeners) fn(); },
    listenerCount: () => listeners.length,
  };
  return realm;
}

/** Container-resize route: goes straight through Chart.resize(), not the listener. */
function containerResize(inst, facts, w, h) { inst.cssBox = { w, h }; return resize(inst, facts); }

// The measured numbers from the sibling lane.
const BOX_BEFORE = { w: 791, h: 849 };
const BOX_AFTER = { w: 449, h: 700 };

// ───────────────────────── cells ─────────────────────────

function cellPanelListenerRegistered(facts) {
  const realm = makeRealm(facts);
  const host = makeInstance(facts, { isPanel: false, w: 1200, h: 800 });
  const panel = makeInstance(facts, { isPanel: true, ...BOX_BEFORE });
  realm.add(host); realm.add(panel);
  const pass = facts.panelResizeRegistered && realm.listenerCount() === 2;
  return {
    cell: 'RESIZE-PANEL-LISTENER-REGISTERED',
    status: pass ? 'GREEN' : 'RED',
    detail: {
      registrationsFound: facts.registrations,
      panelResizeRegistered: facts.panelResizeRegistered,
      listenersInstalled: realm.listenerCount(),
    },
    reason: pass ? null : 'no window resize registration is reachable when this.isPanel is true',
  };
}

function cellPanelBackingStoreReflows(facts) {
  const realm = makeRealm(facts);
  const host = makeInstance(facts, { isPanel: false, w: 1200, h: 800 });
  const panel = makeInstance(facts, { isPanel: true, ...BOX_BEFORE });
  realm.add(host); realm.add(panel);

  // A REAL viewport change: the CSS boxes actually change. Chart.resize()
  // early-returns on a no-op, so a synthetic same-size event would measure
  // nothing and any GREEN from it would be meaningless.
  host.cssBox = { w: 900, h: 700 };
  panel.cssBox = { ...BOX_AFTER };
  realm.dispatchWindowResize();

  const want = { w: Math.floor(BOX_AFTER.w * panel.dpr), h: Math.floor(BOX_AFTER.h * panel.dpr) };
  const pass = panel.backingStore.w === want.w && panel.backingStore.h === want.h;
  return {
    cell: 'RESIZE-PANEL-BACKING-STORE-REFLOWS',
    status: pass ? 'GREEN' : 'RED',
    detail: {
      cssBoxBefore: BOX_BEFORE, cssBoxAfter: BOX_AFTER,
      backingStoreObserved: panel.backingStore, backingStoreExpected: want,
      panelResizeCalls: panel.resizeCalls,
    },
    reason: pass ? null
      : `panel CSS box reflowed ${BOX_BEFORE.w}x${BOX_BEFORE.h} -> ${BOX_AFTER.w}x${BOX_AFTER.h} but backing store stayed ${panel.backingStore.w}x${panel.backingStore.h}`,
  };
}

/**
 * ANTI-VACUOUS-GREEN CELL. Proves the instrument can tell a real dimension
 * change from a synthetic one: a same-size resize event must do NO work.
 * If this cell ever goes RED the other resize cells' GREEN is meaningless.
 */
function cellNoOpResizeMeasuresNothing(facts) {
  const realm = makeRealm(facts);
  const panel = makeInstance(facts, { isPanel: true, ...BOX_BEFORE });
  realm.add(panel);
  const rendersBefore = panel.renders;
  realm.dispatchWindowResize();       // same dimensions: must early-return
  realm.dispatchWindowResize();
  const didNothing = panel.renders === rendersBefore;
  // and the early-return must have actually been the reason, when registered
  const earlyReturnObserved = !facts.panelResizeRegistered || panel.resizeEarlyReturns > 0;
  const pass = didNothing && earlyReturnObserved && facts.earlyReturnIntact;
  return {
    cell: 'RESIZE-NOOP-MEASURES-NOTHING',
    status: pass ? 'GREEN' : 'RED',
    detail: {
      renders: panel.renders, resizeCalls: panel.resizeCalls,
      earlyReturns: panel.resizeEarlyReturns,
      earlyReturnConjunctsInSource: facts.earlyReturnConjuncts,
      earlyReturnIntact: facts.earlyReturnIntact,
    },
    reason: pass ? null : 'a same-size resize event did work, or the real early-return predicate is gone from source',
  };
}

/** Container resize is a genuinely different route: straight to Chart.resize(). */
function cellContainerResizeRouteStillWorks(facts) {
  const panel = makeInstance(facts, { isPanel: true, ...BOX_BEFORE });
  const did = containerResize(panel, facts, BOX_AFTER.w, BOX_AFTER.h);
  const want = { w: BOX_AFTER.w, h: BOX_AFTER.h };
  const pass = did && panel.backingStore.w === want.w && panel.backingStore.h === want.h;
  return {
    cell: 'RESIZE-CONTAINER-ROUTE-UNCHANGED',
    status: pass ? 'GREEN' : 'RED',
    detail: { backingStore: panel.backingStore, expected: want, didWork: did },
    reason: pass ? null : 'container-resize route through Chart.resize() regressed',
  };
}

// ── kill-switch semantics ──

const TRUTHY_DISABLING = [1, 'yes', 'true', {}, [], '0'];
const FALSY_KEEPING = [undefined, null, false, 0, '', NaN];

function driveSwitch(facts, value) {
  const realm = makeRealm(facts, value);
  const panel = makeInstance(facts, { isPanel: true, ...BOX_BEFORE });
  realm.add(panel);
  panel.cssBox = { ...BOX_AFTER };
  realm.dispatchWindowResize();
  const reflowed = panel.backingStore.w === Math.floor(BOX_AFTER.w * panel.dpr);
  return { reflowed, backingStore: panel.backingStore };
}

function cellSwitchTruthyDisables(facts) {
  const rows = TRUTHY_DISABLING.map((v) => {
    const r = driveSwitch(facts, v);
    return { value: label(v), disabled: !r.reflowed, backingStore: r.backingStore };
  });
  // Only meaningful once the fix exists; before that nothing is registered and
  // "disabled" is trivially true. Require the switch to be present in source.
  const allDisabled = rows.every((r) => r.disabled);
  const pass = facts.switchReadPresent && !facts.strictTrueComparison && allDisabled;
  return {
    cell: 'KILLSWITCH-TRUTHY-DISABLES',
    status: pass ? 'GREEN' : 'RED',
    detail: { rows, switchInSource: facts.switchReadPresent, strictTrueComparison: facts.strictTrueComparison },
    reason: pass ? null
      : !facts.switchReadPresent ? `${SWITCH_NAME} is not read anywhere in chart.js`
        : facts.strictTrueComparison ? `${SWITCH_NAME} is compared with strict equality to true — truthy values would not disable`
          : 'some truthy value failed to disable the fix',
  };
}

function cellSwitchFalsyKeeps(facts) {
  const rows = FALSY_KEEPING.map((v) => {
    const r = driveSwitch(facts, v);
    return { value: label(v), fixActive: r.reflowed, backingStore: r.backingStore };
  });
  const allKeep = rows.every((r) => r.fixActive);
  const pass = facts.switchReadPresent && allKeep;
  return {
    cell: 'KILLSWITCH-FALSY-KEEPS-FIX',
    status: pass ? 'GREEN' : 'RED',
    detail: { rows },
    reason: pass ? null : 'a falsy switch value disabled the fix (it must not)',
  };
}

/** FLAG-02: flippable mid-session, no reload, on a live instance. */
function cellMidSessionFlip(facts) {
  const realm = makeRealm(facts, undefined);
  const panel = makeInstance(facts, { isPanel: true, ...BOX_BEFORE });
  realm.add(panel);
  const listenersAtStart = realm.listenerCount();

  // phase 1: switch OFF (absent) — fix active, real dimension change
  panel.cssBox = { w: 600, h: 500 };
  realm.dispatchWindowResize();
  const afterPhase1 = { ...panel.backingStore };

  // phase 2: flip the switch ON mid-run on the SAME live instance, no re-init
  realm.switchValue = 'true';
  panel.cssBox = { ...BOX_AFTER };
  realm.dispatchWindowResize();
  const afterPhase2 = { ...panel.backingStore };

  // phase 3: flip back OFF, still the same instance
  realm.switchValue = undefined;
  realm.dispatchWindowResize();
  const afterPhase3 = { ...panel.backingStore };

  const phase1Worked = afterPhase1.w === 600;
  const phase2Froze = afterPhase2.w === 600;               // disabled: no reflow
  const phase3Resumed = afterPhase3.w === BOX_AFTER.w;     // re-enabled: catches up
  const noReinit = realm.listenerCount() === listenersAtStart;
  const pass = facts.switchReadPresent && phase1Worked && phase2Froze && phase3Resumed && noReinit;
  return {
    cell: 'FLAG02-MIDSESSION-FLIP-NO-RELOAD',
    status: pass ? 'GREEN' : 'RED',
    detail: { afterPhase1, afterPhase2, afterPhase3, listenersAtStart, listenersAtEnd: realm.listenerCount() },
    reason: pass ? null : 'switch is not honoured per call on a live instance without re-registration',
  };
}

/**
 * FLAG-03: the OFF arm must assert a WORKING PRODUCT, not "the feature is
 * inactive". With the fix disabled, keyboard and mouse must still drive the
 * chart, the crosshair must still track, and coordinates must still resolve
 * against the correct element's rect.
 */
function cellOffArmWorkingProduct(facts) {
  const realm = makeRealm(facts, 'true'); // fix DISABLED
  const host = makeInstance(facts, { isPanel: false, w: 1200, h: 800 });
  const panel = makeInstance(facts, { isPanel: true, ...BOX_BEFORE });
  panel.canvasRect = { left: 1981, top: 0, width: BOX_BEFORE.w, height: BOX_BEFORE.h };
  realm.add(host); realm.add(panel);

  const failures = [];

  // mouse: aimed at the panel's canvas, must resolve against the PANEL's rect
  const clientX = 1188 + 1981;
  panel.mouseX = clientX - panel.canvasRect.left;
  panel.crosshair = { x: panel.mouseX };
  if (panel.mouseX !== 1188) failures.push({ reason: 'mouse-coordinate-wrong-rect', mouseX: panel.mouseX });
  if (panel.mouseX < 0) failures.push({ reason: 'mouse-coordinate-negative', mouseX: panel.mouseX });
  if (!panel.crosshair || panel.crosshair.x !== 1188) failures.push({ reason: 'crosshair-not-tracking' });

  // keyboard still drives the chart
  panel.keyEvents += 1;
  if (panel.keyEvents !== 1) failures.push({ reason: 'keyboard-not-delivered' });

  // container-resize route must STILL work with the fix off — this is the
  // product staying usable, not merely the feature being inactive
  const containerWorked = containerResize(panel, facts, BOX_AFTER.w, BOX_AFTER.h);
  if (!containerWorked) failures.push({ reason: 'container-resize-route-broken-in-off-arm' });

  // host resize must be untouched by the panel fix being off
  host.cssBox = { w: 900, h: 700 };
  realm.dispatchWindowResize();
  if (host.backingStore.w !== 900) failures.push({ reason: 'host-resize-regressed-in-off-arm', host: host.backingStore });

  return {
    cell: 'FLAG03-OFF-ARM-IS-A-WORKING-PRODUCT',
    status: failures.length ? 'RED' : 'GREEN',
    detail: {
      panelMouseX: panel.mouseX, crosshair: panel.crosshair,
      keyEvents: panel.keyEvents, hostBackingStore: host.backingStore,
      containerRouteWorked: containerWorked,
    },
    failures,
    reason: failures.length ? 'OFF arm does not present a working product' : null,
  };
}

function label(v) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
  if (typeof v === 'object') return Array.isArray(v) ? '[]' : '{}';
  if (v === '') return "''";
  return JSON.stringify(v);
}

// ───────────────────────── runner ─────────────────────────

export function runResizeSuite(chartJsPath) {
  const facts = extractFacts(chartJsPath);

  // Loud NOT_APPLIED reporting: if a needle the mutant battery relies on is
  // absent, say so rather than letting a cell pass vacuously.
  const missingNeedles = Object.entries(facts.needles)
    .filter(([k, present]) => !present && k !== 'panelResizeRegistration' && k !== 'switchRead')
    .map(([k]) => k);

  const cells = [
    cellPanelListenerRegistered(facts),
    cellPanelBackingStoreReflows(facts),
    cellNoOpResizeMeasuresNothing(facts),
    cellContainerResizeRouteStillWorks(facts),
    cellSwitchTruthyDisables(facts),
    cellSwitchFalsyKeeps(facts),
    cellMidSessionFlip(facts),
    cellOffArmWorkingProduct(facts),
  ];

  return {
    signature: SIGNATURE,
    chartJsPath,
    chartJsBytes: facts.bytes,
    status: cells.every((c) => c.status === 'GREEN') ? 'GREEN' : 'RED',
    missingNeedles,
    facts: {
      registrations: facts.registrations,
      panelResizeRegistered: facts.panelResizeRegistered,
      switchReadPresent: facts.switchReadPresent,
      switchReadCount: facts.switchReadCount,
      strictTrueComparison: facts.strictTrueComparison,
      earlyReturnConjuncts: facts.earlyReturnConjuncts,
      earlyReturnIntact: facts.earlyReturnIntact,
    },
    cells,
    limitation: 'No browser in this lane. Behavioural cells are driven by facts '
      + 'extracted from the real chart.js by AST; the mutant battery is the proof '
      + 'that they depend on the shipped bytes.',
  };
}

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const target = process.argv[2]
    || path.resolve(HERE, '../../chart v 1.4/chart/chart.js');
  const report = runResizeSuite(target);
  const outArg = process.argv[3];
  if (outArg) fs.writeFileSync(outArg, `${JSON.stringify({ ...report, measuredAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(JSON.stringify({
    signature: report.signature,
    status: report.status,
    chartJsBytes: report.chartJsBytes,
    facts: report.facts,
    missingNeedles: report.missingNeedles,
    cells: report.cells.map((c) => ({ cell: c.cell, status: c.status, reason: c.reason })),
  }, null, 2));
  if (report.missingNeedles.length) {
    console.log(`\nNOT_APPLIED RISK — needles absent from source: ${report.missingNeedles.join(', ')}`);
  }
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
