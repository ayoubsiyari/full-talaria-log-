import {
  ensureBuiltReactStack,
  launchBrowser,
  bootReactMultichart,
  seedDrawing,
  drawingHitLocalPoint,
  localToPagePoint,
} from './react-parity-lib.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser({ headful: false });
try {
  const boot = await bootReactMultichart(browser, stack, {});
  const { page } = boot;
  const tool = await seedDrawing(page, 'A', 'rectangle');
  const hit = await drawingHitLocalPoint(page, 'A', tool.id);
  const pt = await localToPagePoint(page, 'A', hit.x, hit.y);
  const info = await page.evaluate((x, y, lx, ly) => {
    const canvas = document.getElementById('chartCanvas');
    const wrap = document.getElementById('chartWrapper');
    const svg = document.querySelector('svg');
    const layerInfo = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const cls = el.className && el.className.baseVal !== undefined
        ? el.className.baseVal
        : String(el.className || '');
      return {
        tag: el.tagName,
        id: el.id,
        cls: cls.slice(0, 50),
        r: { l: b.left, t: b.top, w: b.width, h: b.height },
        pe: cs.pointerEvents,
        z: cs.zIndex,
      };
    };
    const els = [];
    if (typeof document.elementsFromPoint === 'function') {
      document.elementsFromPoint(x, y).slice(0, 12).forEach((el) => {
        const cls = el.className && el.className.baseVal !== undefined
          ? el.className.baseVal
          : String(el.className || '');
        els.push({ tag: el.tagName, id: el.id, cls: cls.slice(0, 50) });
      });
    }
    const ch = window.chart;
    let local = null;
    if (ch && typeof ch._eventCanvasLocalXY === 'function') {
      local = ch._eventCanvasLocalXY({ clientX: x, clientY: y });
    }
    const hits = ch && ch.drawingManager
      ? (ch.drawingManager.findDrawingsAtPoint(lx, ly) || []).map((d) => d.id)
      : null;
    return {
      x, y, lx, ly, local, hits,
      layers: [layerInfo(canvas), layerInfo(wrap), layerInfo(svg)],
      els,
      htmlCls: document.documentElement.className,
    };
  }, pt.x, pt.y, hit.layoutX, hit.layoutY);
  console.log(JSON.stringify({ hit, pt, info }, null, 2));
  await boot.close();
} finally {
  await browser.close();
  await stack.close();
}
