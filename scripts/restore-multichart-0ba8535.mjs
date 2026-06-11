import fs from 'fs';
import { execSync } from 'child_process';

const old = execSync('git show 0ba8535:"chart v 1.4/chart/chart.js"', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
const newPath = 'chart v 1.4/chart/chart.js';
let out = fs.readFileSync(newPath, 'utf8');

const names = [
  ['async _tryMultichartEmbedBacktestTimeframeFastPath', 80],
  ['async loadMultichartPanelFromHost', 320],
  ['_independentPanelTimeframeSwitch', 120],
  ['_applyClientResampleTimeframeSwitch', 80],
  ['async _deferBacktestTfSwitchFollowUp', 120],
  ['async _hotSwapBacktestReplayTimeframe', 220],
  ['async _applyBacktestTimeframeCacheEntry', 120],
  ['async _refetchBacktestTimeframeCore', 200],
];

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractBlock(src, sig) {
  const bare = sig.replace(/^async /, '');
  const pat = new RegExp(`(    (?:async )?${esc(bare)}\\([^)]*\\) \\{)`);
  const m = pat.exec(src);
  if (!m) throw new Error(`missing old ${sig}`);
  const start = m.index;
  let i = m.index + m[0].length - 1;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
    i++;
  }
  throw new Error(`unclosed old ${sig}`);
}

function replaceBlock(cur, sig, block) {
  const bare = sig.replace(/^async /, '');
  const pat = new RegExp(`    (?:async )?${esc(bare)}\\([^)]*\\) \\{`);
  const m = pat.exec(cur);
  if (!m) throw new Error(`missing cur ${sig}`);
  const start = m.index;
  let i = m.index + m[0].length - 1;
  let depth = 0;
  while (i < cur.length) {
    const c = cur[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return cur.slice(0, start) + block + cur.slice(i + 1);
    }
    i++;
  }
  throw new Error(`unclosed cur ${sig}`);
}

for (const [sig, maxLines] of names) {
  const block = extractBlock(old, sig);
  const lines = block.split('\n').length;
  if (lines > maxLines) {
    throw new Error(`block too large for ${sig}: ${lines} > ${maxLines}`);
  }
  out = replaceBlock(out, sig, block);
  console.log('restored', sig, `(${lines} lines)`);
}

for (const helper of ['_btTfCacheCoversTimestamp', '_finishReplayTfSwitchViewport']) {
  const re = new RegExp(
    `\\n    (?:/\\*[\\s\\S]*?\\*/\\n    )?${esc(helper)}\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n`
  );
  if (re.test(out)) {
    out = out.replace(re, '\n');
    console.log('removed', helper);
  } else {
    console.log('warn remove', helper);
  }
}

const embedRe = /        if \(replay && replay\.isActive && isEmbed\) \{[\s\S]*?\n            return;\n        \}/;
const mOld = embedRe.exec(old);
const mCur = embedRe.exec(out);
if (mOld && mCur) {
  out = out.slice(0, mCur.index) + mOld[0] + out.slice(mCur.index + mCur[0].length);
  console.log('restored _resetViewportToDefault embed');
}

fs.writeFileSync(newPath, out);
console.log('done');
