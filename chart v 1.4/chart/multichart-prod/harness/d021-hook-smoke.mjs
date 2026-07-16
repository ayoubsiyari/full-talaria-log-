import { ensureBuiltReactStack, launchBrowser, bootReactMultichart } from './react-parity-lib.mjs';

const stack = await ensureBuiltReactStack();
const browser = await launchBrowser({ headful: false });
try {
  for (const [label, opts] of [
    ['panelKeyboardOff', { panelKeyboardOff: true }],
    ['peerDeselectOff', { switchOffPeerDeselect: true }],
  ]) {
    const boot = await bootReactMultichart(browser, stack, opts);
    const flags = await boot.page.evaluate(() => ({
      panelKb: !!window.__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1,
      peerDeselect: !!window.__TALARIA_DISABLE_MULTICHART_PEER_DESELECT_V1,
    }));
    console.log(label, JSON.stringify(flags));
    await boot.close();
  }
} finally {
  await browser.close();
  await stack.close();
}
