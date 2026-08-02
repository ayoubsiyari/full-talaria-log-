import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

class FakeClassList {
  constructor(owner, classes = '') {
    this.owner = owner;
    this.set = new Set(String(classes).split(/\s+/).filter(Boolean));
  }
  contains(name) { return this.set.has(name); }
  add(name) { this.set.add(name); this.owner.attrs.class = [...this.set].join(' '); }
  remove(name) { this.set.delete(name); this.owner.attrs.class = [...this.set].join(' '); }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : !!force;
    if (on) this.add(name); else this.remove(name);
    return on;
  }
}

class FakeNode {
  constructor(tag = 'g') {
    this.tag = tag;
    this.attrs = {};
    this.styles = {};
    this.style = this.styles;
    this.children = [];
    this.parent = null;
    this.textValue = '';
    this.removed = false;
    this.bboxCount = 0;
    this.classList = new FakeClassList(this);
  }
  get childNodes() { return this.children; }
  append(tag) {
    const child = new FakeNode(tag);
    child.parent = this;
    this.children.push(child);
    return new FakeSelection(child);
  }
  remove() {
    this.removed = true;
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  getBBox() {
    this.bboxCount += 1;
    return { width: Math.max(10, this.textValue.length * 6), height: 18, x: 0, y: 0 };
  }
  getBoundingClientRect() {
    this.bboxCount += 1;
    return { top: 92, bottom: 108, left: 10, right: 30, width: 20, height: 16 };
  }
  querySelectorAll(selector) {
    if (selector !== '.om-level-ctrl') return [];
    return this.children.filter((child) => child.classList.contains('om-level-ctrl'));
  }
  getAttribute(name) { return this.attrs[name]; }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === 'class') this.classList = new FakeClassList(this, value);
  }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); }
  removeAttribute(name) { delete this.attrs[name]; }
}

class FakeSelection {
  constructor(node) { this._node = node || null; }
  append(tag) { return this._node.append(tag); }
  attr(name, value) {
    if (!this._node) return arguments.length === 1 ? undefined : this;
    if (arguments.length === 1) return this._node.attrs[name];
    this._node.setAttribute(name, value);
    return this;
  }
  style(name, value) {
    if (!this._node) return arguments.length === 1 ? undefined : this;
    if (arguments.length === 1) return this._node.styles[name];
    this._node.styles[name] = String(value);
    return this;
  }
  text(value) {
    if (!this._node) return arguments.length === 0 ? '' : this;
    if (arguments.length === 0) return this._node.textValue;
    this._node.textValue = String(value);
    return this;
  }
  node() { return this._node; }
  empty() { return !this._node; }
  remove() { this._node?.remove(); return this; }
  select(selector) {
    if (!this._node) return new FakeSelection(null);
    const className = selector.startsWith('.') ? selector.slice(1) : null;
    const found = this._node.children.find((child) => className && child.classList.contains(className));
    return new FakeSelection(found || null);
  }
  selectAll() {
    const node = this._node;
    return {
      remove: () => {
        if (node) node.children.slice().forEach((child) => child.remove());
      },
    };
  }
}

function makeOm() {
  const om = Object.create(OrderManager.prototype);
  om._tradeMarkerToastTheme = () => ({
    light: false,
    text: '#fff',
    bg: '#111',
    border: '#333',
    accentDefault: '#22c55e',
  });
  om._orderLevelLabelFontFamily = () => 'Inter, sans-serif';
  om._orderLevelDetailColor = () => '#22c55e';
  om.getMarketConfig = () => ({ positionLabel: 'Lots' });
  return om;
}

{
  const om = makeOm();
  const group = new FakeSelection(new FakeNode('g'));
  const first = om._buildOrderLevelToastLabelInGroup(group, {
    tagText: 'LIMIT BUY 1.00',
    detailText: '+$10',
    detailColor: '#22c55e',
    accent: '#22c55e',
    isPreview: true,
    height: 24,
  });
  const shell = group.select('.order-level-toast-label').node();
  const second = om._buildOrderLevelToastLabelInGroup(group, {
    tagText: 'LIMIT BUY 1.10',
    detailText: '+$11',
    detailColor: '#22c55e',
    accent: '#22c55e',
    isPreview: true,
    height: 24,
  });
  assert.equal(group.node().children.filter((child) => child.classList.contains('order-level-toast-label')).length, 1);
  assert.equal(group.select('.order-level-toast-label').node(), shell, 'value-box shell is reused across same-shape renders');
  assert.equal(group.select('.order-level-toast-tag').text(), '', 'direct parent lookup does not flatten children');
  assert.ok(second.width >= first.width, 'reused shell still reports measured width');
}

{
  const om = makeOm();
  const root = new FakeNode('g');
  const shell = new FakeNode('g');
  shell.setAttribute('class', 'order-level-toast-label');
  const ctrl = new FakeNode('g');
  ctrl.setAttribute('class', 'om-level-ctrl');
  root.children.push(shell, ctrl);
  shell.parent = root;
  ctrl.parent = root;
  const group = new FakeSelection(root);
  om._clearPreviewLabelGroupForRender(group);
  assert.equal(root.children.includes(shell), true, 'stable path preserves value-box shell');
  assert.equal(root.children.includes(ctrl), false, 'stable path clears adjacent controls before rebuilding them');

  global.window = { __TALARIA_DISABLE_ORDER_STABLE_LABEL_HOVER_DOM_V1: true };
  root.children.push(ctrl);
  ctrl.parent = root;
  om._clearPreviewLabelGroupForRender(group);
  assert.equal(root.children.length, 0, 'kill-switch restores full label-group teardown');
  delete global.window;
}

{
  const om = makeOm();
  const group = new FakeSelection(new FakeNode('g'));
  const stopDims = om._buildOrderLevelToastLabelInGroup(group, {
    tagText: 'STOP BUY 1 Lots',
    detailText: '+$10.00 (1 Lots)',
    detailColor: '#22c55e',
    accent: '#22c55e',
    isPreview: true,
  });
  const limitDims = om._buildOrderLevelToastLabelInGroup(group, {
    tagText: 'LIMIT SELL 100 Lots',
    detailText: '-$999.99 (100 Lots)',
    detailColor: '#ef4444',
    accent: '#ef4444',
    isPreview: true,
  });
  assert.equal(stopDims.width, limitDims.width, 'toast shell width is fixed across stop/limit content changes');
  assert.equal(stopDims.height, limitDims.height, 'toast shell height is fixed across content changes');
  assert.equal(
    group.select('.order-level-toast-label').select('.order-level-toast-detail').attr('x'),
    '139',
    'detail column does not move with tag text width',
  );
}

{
  const om = makeOm();
  om.orderType = 'limit';
  om.orderSide = 'BUY';
  global.window = {};
  global.document = {
    getElementById: (id) => {
      if (id === 'orderQuantity') return { value: '1' };
      if (id === 'orderEntryPrice') return { value: '100' };
      return null;
    },
  };
  const entrySegs = om.composePreviewLabelSegments('Entry', 100, '#2962ff', 'BUY');
  assert.equal(entrySegs[0].text, 'LIMIT BUY 1 Lots', 'entry size includes unit');
  om._getReferenceEntryForOrderMath = () => 100;
  om.estimatePnLForPriceLevel = () => 12.34;
  const info = om._formatTpSlInfoText('TP', 101);
  assert.equal(info, '+$12.34 (1 Lots)', 'TP/SL detail uses consistent brackets and size unit');
  delete global.document;
  delete global.window;
}

{
  const om = makeOm();
  let rafCalls = 0;
  global.requestAnimationFrame = (fn) => { rafCalls += 1; fn(); return rafCalls; };
  const badge = new FakeNode('g');
  badge.setAttribute('class', 'om-level-ctrl');
  badge.setAttribute('data-level-price', '100');
  const groupNode = new FakeNode('g');
  groupNode.children.push(badge);
  badge.parent = groupNode;
  const container = {
    __omInside: true,
    __omY: 100,
    __omX: 20,
    getBoundingClientRect: () => ({ top: 0 }),
  };
  const ch = {
    svg: { node: () => ({ parentElement: container }) },
    scales: { yScale: () => 100 },
  };
  om._applyImmediateLevelCtrlHoverForGroup(groupNode, ch);
  assert.equal(badge.styles.opacity, '1', 'hovered control is shown immediately');
  assert.equal(badge.styles.pointerEvents, 'all', 'shown controls are clickable in the same pass');
  assert.equal(badge.bboxCount, 1, 'stable path avoids the old extra forced layout read per badge');
  assert.equal(rafCalls, 1, 'transitions restore once as a batch');
  delete global.requestAnimationFrame;
}

{
  const om = makeOm();
  om.isDraggingPreviewLine = true;
  const badge = new FakeNode('g');
  badge.setAttribute('class', 'om-level-ctrl om-ctrl-hover');
  badge.styles.opacity = '1';
  badge.styles.pointerEvents = 'all';
  const groupNode = new FakeNode('g');
  groupNode.children.push(badge);
  badge.parent = groupNode;
  om._applyImmediateLevelCtrlHoverForGroup(groupNode, {});
  assert.equal(badge.styles.opacity, '0', 'dragging hides hover controls');
  assert.equal(badge.styles.pointerEvents, 'none', 'drag-hidden controls cannot be clicked');
  assert.equal(badge.classList.contains('om-ctrl-hover'), false, 'dragging clears active hover state');
}

console.log('GREEN - stable preview labels and hover controls update without rebuild shimmer');
