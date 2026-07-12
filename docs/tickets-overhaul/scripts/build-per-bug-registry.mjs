/**
 * T0 Lane 4 — build PER-BUG-REGISTRY.csv from TICKET-REGISTRY.csv +
 * tickets_normalized.json. Long threads are hand-split; short threads default
 * to one bug per thread with keyword classification.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const REGISTRY_CSV = path.join(ROOT, 'docs/tickets-overhaul/TICKET-REGISTRY.csv');
const TICKETS_JSON = path.join(ROOT, 'support tickets history/tickets_normalized.json');
const OUT_CSV = path.join(ROOT, 'docs/tickets-overhaul/PER-BUG-REGISTRY.csv');

const HAND_READ_REFS = new Set([
  'TAL-00157', 'TAL-00322', 'TAL-00323', 'TAL-00752', 'TAL-00117',
  'TAL-00228', 'TAL-00245', 'TAL-00350', 'TAL-00271',
]);

/** @type {Record<string, Array<{symptom_family:string, rc_guess:string, tester_quote:string, notes?:string}>>} */
const HAND_SPLITS = {
  'TAL-00157': [
    { symptom_family: 'ghost-after-delete', rc_guess: 'RC-1', tester_quote: 'Delete box from settings leaves price/time labels on chart' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Current price label displayed far right instead of at price number start' },
    { symptom_family: 'slow-interaction', rc_guess: 'RC-2', tester_quote: 'Grid lines render above candles while panning chart' },
    { symptom_family: 'drag-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Tool anchored at candle edge jumps to previous candle middle on click' },
    { symptom_family: 'selection-menu-desync', rc_guess: 'RC-1', tester_quote: 'Ctrl+drag loses selection but Quick Menu stays visible and settings inaccessible' },
    { symptom_family: 'slow-interaction', rc_guess: 'RC-2', tester_quote: 'Candles become slightly blurred while a tool is selected' },
    { symptom_family: 'drag-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Moving one box drags other tools and the chart together' },
    { symptom_family: 'slow-interaction', rc_guess: 'RC-2', tester_quote: 'Screenshot glitch when moving tools' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Price/time labels do not follow tool while dragging; crosshair stuck at old position' },
    { symptom_family: 'selection-menu-desync', rc_guess: 'RC-1', tester_quote: 'Ctrl hides price/time labels but Quick Menu remains editable without selection' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Clicking chart reveals candles through price label overlay' },
    { symptom_family: 'indicator-lifecycle', rc_guess: 'RC-6', tester_quote: 'Indicator pane shifts when moving chart with stacked indicators' },
    { symptom_family: 'indicator-lifecycle', rc_guess: 'RC-6', tester_quote: 'Dragging indicator price label collapses/displaces chart pane' },
    { symptom_family: 'slow-interaction', rc_guess: 'RC-2', tester_quote: 'Candle colors and gaps glitch when chart viewport is very small' },
    { symptom_family: 'slow-interaction', rc_guess: 'RC-2', tester_quote: 'Zoom in/out causes chart rendering glitches' },
    { symptom_family: 'replay-interaction', rc_guess: 'RC-8', tester_quote: 'Replay playback does not update certain chart elements' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Labels hidden until options clicked even when label toggles exist', notes: 'Arabic: labels should show on click without enabling options first' },
    { symptom_family: 'replay-interaction', rc_guess: 'RC-8', tester_quote: 'Roll Back advances groups of candles instead of one candle at a time' },
    { symptom_family: 'replay-interaction', rc_guess: 'RC-8', tester_quote: 'Seconds hand not working when replay is enabled' },
    { symptom_family: 'slow-interaction', rc_guess: 'RC-2', tester_quote: 'Week opening gap renders incorrect red candlestick when scrolling back' },
    { symptom_family: 'slow-interaction', rc_guess: 'RC-2', tester_quote: 'Chart shows excessive gaps in candle display' },
    { symptom_family: 'multichart-parity', rc_guess: 'RC-4', tester_quote: 'Price mismatch when switching 15m to 1m timeframe' },
    { symptom_family: 'replay-interaction', rc_guess: 'RC-8', tester_quote: 'Replay slow unless user keeps clicking chart button' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Price label snaps back when dragged during replay', notes: 'Arabic: dragging price label while replay on returns to previous position' },
  ],
  'TAL-00322': [
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Quick menu tools do not work on first use' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Double-click shows wrong quick interface (text/volume profile)' },
    { symptom_family: 'stuck-until-click', rc_guess: 'RC-2', tester_quote: 'Moved anchored VWAP stays hidden until user taps screen' },
    { symptom_family: 'drag-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Tool can be placed after the last candle on chart' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Quick menu color/lock/delete do not work on first attempt' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Label toggles require input menu before they activate from quick menu' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Quick Menu stacks above settings dialog instead of below' },
    { symptom_family: 'ghost-after-delete', rc_guess: 'RC-1', tester_quote: 'Delete from settings removes tool but settings dialog remains' },
    { symptom_family: 'slow-interaction', rc_guess: 'RC-2', tester_quote: 'Chart pan becomes very slow and candle-by-candle when quick menu enabled' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'No reset or apply-default button in settings' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Price/time labels do not work for anchored VWAP' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Price label stays at click point instead of on VWAP line center' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Price label should anchor at VWAP line end not beginning' },
    { symptom_family: 'visibility-toggle', rc_guess: 'RC-2', tester_quote: 'Visibility toggle does not restore hidden timeframe' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'First click does not show VWAP line; requires second click' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'No style/thickness controls for VWAP line' },
    { symptom_family: 'stuck-until-click', rc_guess: 'RC-2', tester_quote: 'Dragging control point 2 hides VWAP until placed elsewhere', notes: 'Control point 1 drag works; point 2 hides line during drag' },
  ],
  'TAL-00323': [
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Quick Menu remains stacked above settings after drawing volume profile' },
    { symptom_family: 'drag-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Repositioned volume profile snaps back after reopening settings' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Double-click quick interface hides text and volume profile controls' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Fixed range volume profile controls do not work on first click' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Tick-per-rows selection reverts to numbers-of-rows on OK' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Style color picker stays stuck on screen when switching menu tabs' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Numeric input field loses text on edit; only arrow keys work' },
    { symptom_family: 'selection-menu-desync', rc_guess: 'RC-1', tester_quote: 'Cannot pan chart when clicking on placed volume profile body' },
    { symptom_family: 'drag-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Extend-right should stop at last candle not extend indefinitely' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Price label placed at tool corners instead of high/low volume nodes' },
    { symptom_family: 'selection-menu-desync', rc_guess: 'RC-1', tester_quote: 'After closing settings cannot draw another tool until crosshair selected' },
    { symptom_family: 'ghost-after-delete', rc_guess: 'RC-1', tester_quote: 'Delete tool while settings open removes shape but settings remain', notes: 'Arabic: delete while settings open leaves settings dialog' },
    { symptom_family: 'drag-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Cannot drag volume profile body to new location after placement', notes: 'Arabic: body drag does not move tool' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'First click does not show move handles on volume profile' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Price label should stay fixed at corner 1/2 not follow placement click' },
  ],
  'TAL-00752': [
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Stop order entry line shown in red with multiple orders' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Deleting first multi-entry leaves second entry price stuck at 0.00' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'TP/SL connector line flickers/disappears each replay candle' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Replay + drag limit order glitches stop loss position' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Keyboard chart move triggers order entry glitch during replay', notes: 'Arabic: moving chart from keyboard causes glitch' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Average entry stuck on first entry when second moved below first' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Risk split stays 50 after deleting extra entry instead of reverting to 100' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Lot size glitches when changed via arrow input' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Second entry preview appears at TP screen instead of below/above price for limit' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Closing order via X button is difficult / unreliable' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Pending limit order SL cannot be above entry until after placement' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Trailing zero in SL/TP parsing zeroes lot size' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: '1RR order entry displayed in red incorrectly' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Cancel order leaves menu active; entry price does not track price movement' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Cannot change SL/TP from order panel controls' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'PNL shows profit while price below long entry after TP1 hit' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'SL/TP lines not rendered when value is below 10' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Moving second entry mutates limit order to market order' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'SL/TP arrow drag starts from zero instead of entry price' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Multiple entries require repeated X clicks to close' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Replay fill occurs on wrong candle vs entry candle' },
    { symptom_family: 'order-entry', rc_guess: 'RC-5', tester_quote: 'Stacked multi-entry orders get stuck when moved on top of each other' },
  ],
  'TAL-00117': [
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Extend Right does not work on first click' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: "Pearson's R toggle does not work on first click" },
    { symptom_family: 'visibility-toggle', rc_guess: 'RC-2', tester_quote: 'Middle line hide toggle does not hide line on click' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Upper/Lower background toggles do not work on first click' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Labels toggle does not work on first click' },
    { symptom_family: 'drag-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Regression channel can be dragged past last candle' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Style menu options require double-click + OK to apply' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Input deviation value requires multiple entries to stick' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Apply default in template does not update input values' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Price label at placement point instead of midline start/end' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Input source dropdown does not change on first try' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Apply default does not refresh input field values' },
  ],
  'TAL-00228': [
    { symptom_family: 'selection-menu-desync', rc_guess: 'RC-1', tester_quote: 'Cannot edit/drag Fib timezone after placement; chart pan blocked over tool' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Quick menu only dismisses when clicking far from menu' },
    { symptom_family: 'stuck-until-click', rc_guess: 'RC-2', tester_quote: 'Tool drawn after last candle does not appear' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Style/input toggles require multiple clicks on first use' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Labels controls split across Style and Input menus inconsistently' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Cannot enter negative level values below zero' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Level stepper cannot go below level 1' },
    { symptom_family: 'drag-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Vertical fib levels cannot be moved after placement' },
    { symptom_family: 'stuck-until-click', rc_guess: 'RC-2', tester_quote: 'Vertical tool hidden when drawn in same grid cell background' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Level numbers misaligned when repositioning levels', notes: 'Arabic: moving level up shows line in middle; below hides numbers' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Apply default + immediate widget delete does not persist changes' },
  ],
  'TAL-00245': [
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Cannot change price line count or add level on first click in input' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Fib speed fan controls do not work on first click' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Reset button missing or non-functional' },
    { symptom_family: 'stuck-until-click', rc_guess: 'RC-2', tester_quote: 'Vertically drawn fan invisible until moved again' },
    { symptom_family: 'visibility-toggle', rc_guess: 'RC-2', tester_quote: 'Time level colors toggle does not work', notes: 'Arabic: time level colors not working' },
    { symptom_family: 'ghost-after-delete', rc_guess: 'RC-1', tester_quote: 'Apply default hides background in widget but ghost remains on chart text' },
    { symptom_family: 'visibility-toggle', rc_guess: 'RC-2', tester_quote: 'Grid shown on chart while grid enable is off in widget' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Level numbers move with chart pan instead of staying fixed', notes: 'Arabic: numbers should stay fixed on left' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Apply default sets incorrect thickness in style menu' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Tool near bottom bar renders below screen edge' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Second drawn tool does not inherit first tool saved settings template' },
  ],
  'TAL-00350': [
    { symptom_family: 'ghost-after-delete', rc_guess: 'RC-6', tester_quote: 'Indicator name label remains after indicator deleted' },
    { symptom_family: 'indicator-lifecycle', rc_guess: 'RC-6', tester_quote: 'Indicator price label does not update until replay icon clicked' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-6', tester_quote: 'Need price labels only; time labels unwanted on indicators' },
    { symptom_family: 'indicator-lifecycle', rc_guess: 'RC-6', tester_quote: 'Drawings render above indicator pane and price labels' },
    { symptom_family: 'visibility-toggle', rc_guess: 'RC-6', tester_quote: 'Hide cursor on timeframe affects whole screen not just timeframe' },
    { symptom_family: 'visibility-toggle', rc_guess: 'RC-6', tester_quote: 'Restoring hidden indicator loses name and value until pane divider moved' },
    { symptom_family: 'indicator-lifecycle', rc_guess: 'RC-6', tester_quote: 'Indicator value does not update on hover without chart click' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-6', tester_quote: 'News menu hover shows news list unexpectedly' },
    { symptom_family: 'indicator-lifecycle', rc_guess: 'RC-6', tester_quote: 'Indicator pane divider drag gets stuck' },
    { symptom_family: 'indicator-lifecycle', rc_guess: 'RC-6', tester_quote: 'Remove indicator magnet so divider drag is not blocked' },
    { symptom_family: 'indicator-lifecycle', rc_guess: 'RC-6', tester_quote: 'Indicators disappear on zoom out + chart click', notes: 'Arabic: zoom out then click chart hides indicators' },
  ],
  'TAL-00271': [
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Gann fan controls do not work on first click' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Level numbers move when panning chart right' },
    { symptom_family: 'first-click-fails', rc_guess: 'RC-1', tester_quote: 'Cannot delete/edit numbers or add levels on first click' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Saved settings not applied when drawing second Gann fan' },
    { symptom_family: 'visibility-toggle', rc_guess: 'RC-2', tester_quote: 'Part of Gann fan disappears when panning to chart right edge' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Apply default glitches font thickness and background toggle state' },
    { symptom_family: 'quick-menu-defect', rc_guess: 'RC-1', tester_quote: 'Missing level controls compared to Gann box tool' },
    { symptom_family: 'visibility-toggle', rc_guess: 'RC-2', tester_quote: 'Apply default hides price/time labels despite being enabled' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Fibonacci-style level numbers follow chart pan instead of anchoring to blue points', notes: 'Arabic: same as fib — numbers move with chart' },
    { symptom_family: 'label-mis-anchor', rc_guess: 'RC-3', tester_quote: 'Level numbers must stay fixed at anchor points while panning' },
  ],
};

const FAMILY_RULES = [
  { re: /first click|from first|don'?t work from first|press it the first time|first try|first time/i, family: 'first-click-fails', rc: 'RC-1' },
  { re: /ghost|remain(s)? (on|after)|settings remain|labels? remain|name remain|after delete|after i delete|deleted.*remain/i, family: 'ghost-after-delete', rc: 'RC-1' },
  { re: /stuck|hidden until|tap the screen|click the screen|until i click|until click|doesn'?t update until|not appear until|invisible unless/i, family: 'stuck-until-click', rc: 'RC-2' },
  { re: /quick menu|quick interface|toolbar|menu remain|menu doesn'?t|stale menu|z-order|stacked above/i, family: 'quick-menu-defect', rc: 'RC-1' },
  { re: /ctrl\+|selection disappear|deselect|menu desync|cannot access settings|selection lost/i, family: 'selection-menu-desync', rc: 'RC-1' },
  { re: /label|price label|time label|anchor|middle of the candle|wrong anchor|misplace/i, family: 'label-mis-anchor', rc: 'RC-3' },
  { re: /drag|move.*chart|snap|jump|pan.*tool|mis-?anchor|extend right|last candle|copy.?paste|displace/i, family: 'drag-mis-anchor', rc: 'RC-3' },
  { re: /visibility|hide.*restore|show.*hide|hidden.*restore|visibility tab/i, family: 'visibility-toggle', rc: 'RC-2' },
  { re: /slow|lag|blurred|glitch|freeze|performance|candle by candle/i, family: 'slow-interaction', rc: 'RC-2' },
  { re: /replay|backtest|roll back|playhead|candle by candle|seconds hand/i, family: 'replay-interaction', rc: 'RC-8' },
  { re: /panel|multichart|second chart|layout|iframe|second layout|wrong panel|wrong symbol/i, family: 'multichart-parity', rc: 'RC-4' },
  { re: /order|entry|sl\/tp|stop loss|take profit|limit order|market order|pnl|lot size|multi.?entry|risk split|average/i, family: 'order-entry', rc: 'RC-5' },
  { re: /indicator|pane|divider|magnet.*indicator|killzone|session tool|bollinger|mae|mass index/i, family: 'indicator-lifecycle', rc: 'RC-6' },
];

const CLUSTER_RC_DEFAULT = {
  chart_core_ui: 'RC-1',
  drawing_tools: 'RC-1',
  multichart_layouts: 'RC-4',
  indicators: 'RC-6',
  orders_trading: 'RC-5',
  replay: 'RC-8',
  journal_dashboard: 'RC-7',
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { cols.push(cur); cur = ''; }
      else cur += ch;
    }
    cols.push(cur);
    const row = {};
    header.forEach((h, idx) => { row[h] = cols[idx] || ''; });
    return row;
  });
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function normalizeStatus(s) {
  const v = String(s || '').toLowerCase();
  if (v === 'user_replied') return 'user_replied';
  if (v === 'resolved' || v === 'closed') return 'resolved';
  if (v === 'pending') return 'pending';
  if (v === 'open') return 'open';
  return v || 'open';
}

function classifyAuto(ticket, bodies) {
  const text = [ticket.subject, ...(bodies || [])].join(' ').slice(0, 4000);
  for (const rule of FAMILY_RULES) {
    if (rule.re.test(text)) {
      return { symptom_family: rule.family, rc_guess: rule.rc };
    }
  }
  const clusterRc = CLUSTER_RC_DEFAULT[ticket.cluster] || 'RC-7';
  const familyByCluster = {
    orders_trading: 'order-entry',
    indicators: 'indicator-lifecycle',
    multichart_layouts: 'multichart-parity',
    replay: 'replay-interaction',
    journal_dashboard: 'slow-interaction',
  };
  return {
    symptom_family: familyByCluster[ticket.cluster] || 'slow-interaction',
    rc_guess: clusterRc,
  };
}

function firstTesterQuote(bodies, subject) {
  const b = (bodies || []).find((x) => x && x.trim() && !/^\[Attachment\]$/.test(x.trim()));
  if (b) return b.trim().replace(/\s+/g, ' ').slice(0, 240);
  return String(subject || 'Reported defect').trim().slice(0, 240);
}

function main() {
  const registryRows = parseCsv(fs.readFileSync(REGISTRY_CSV, 'utf8'));
  const tickets = JSON.parse(fs.readFileSync(TICKETS_JSON, 'utf8'));
  const ticketByRef = Object.fromEntries(tickets.map((t) => [t.ref, t]));
  const registryByRef = Object.fromEntries(registryRows.map((r) => [r.ref, r]));

  const out = [];
  out.push(['bug_ref', 'ticket_ref', 'cluster', 'symptom_family', 'rc_guess', 'status', 'tester_quote', 'notes'].join(','));

  for (const reg of registryRows) {
    const ref = reg.ref;
    const ticket = ticketByRef[ref];
    const status = normalizeStatus(reg.status || ticket?.status);
    const cluster = reg.cluster || ticket?.cluster || '';

    if (HAND_READ_REFS.has(ref)) {
      const splits = HAND_SPLITS[ref] || [];
      splits.forEach((bug, idx) => {
        out.push([
          csvEscape(`${ref}#${idx + 1}`),
          csvEscape(ref),
          csvEscape(cluster),
          csvEscape(bug.symptom_family),
          csvEscape(bug.rc_guess),
          csvEscape(status),
          csvEscape(bug.tester_quote),
          csvEscape(bug.notes || ''),
        ].join(','));
      });
      continue;
    }

    const bodies = ticket?.bodies || [];
    const cls = classifyAuto({ ...reg, subject: reg.subject || ticket?.subject, cluster }, bodies);
    const quote = firstTesterQuote(bodies, reg.subject || ticket?.subject);
    out.push([
      csvEscape(`${ref}#1`),
      csvEscape(ref),
      csvEscape(cluster),
      csvEscape(cls.symptom_family),
      csvEscape(cls.rc_guess),
      csvEscape(status),
      csvEscape(quote),
      csvEscape('auto-split: one bug per short thread'),
    ].join(','));
  }

  fs.writeFileSync(OUT_CSV, `${out.join('\n')}\n`, 'utf8');
  const dataRows = out.length - 1;
  console.log(`Wrote ${dataRows} rows to ${OUT_CSV}`);
}

main();
