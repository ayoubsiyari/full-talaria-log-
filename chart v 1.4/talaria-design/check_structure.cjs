const fs = require('fs');
const lines = fs.readFileSync('src/TalariaV8b.jsx', 'utf8').split('\n');

// Check structure from line 2240 to 2901
let depth = 0;
let events = [];
for (let i = 2239; i <= 2900; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  const opens = (line.match(/<div\b/g) || []).length;
  const selfClose = (line.match(/<div[^>]*\/>/g) || []).length;
  const realOpens = opens - selfClose;
  const closes = (line.match(/<\/div>/g) || []).length;
  const net = realOpens - closes;
  if (net !== 0) {
    depth += net;
    events.push({ lineNum, net, depth, preview: line.trim().substring(0, 80) });
  }
}

console.log('Final depth from line 2240 to 2901:', depth);
console.log('');
console.log('All events L2280-L2340:');
events.filter(e => e.lineNum >= 2280 && e.lineNum <= 2340).forEach(e =>
  console.log('  L' + e.lineNum + ': net=' + (e.net>0?'+':'') + e.net + ', depth=' + e.depth + ' | ' + e.preview)
);
