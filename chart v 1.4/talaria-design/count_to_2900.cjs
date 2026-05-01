const fs = require('fs');
const lines = fs.readFileSync('src/TalariaV8b.jsx', 'utf8').split('\n');

// Count div depth from line 903 to 2900
// Using multi-line awareness: track whether a div's /> is on a different line
// First pass: simple single-line counting with awareness
let depth = 0;
let maxDepth = 0;

for (let i = 902; i <= 2899; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  const opens = (line.match(/<div\b/g) || []).length;
  const selfClose = (line.match(/<div[^>]*\/>/g) || []).length;
  const realOpens = opens - selfClose;
  const closes = (line.match(/<\/div>/g) || []).length;
  const net = realOpens - closes;
  depth += net;
  if (depth > maxDepth) maxDepth = depth;
}

console.log('Div depth from L903 to L2900 (inclusive):', depth);
console.log('Max depth reached:', maxDepth);

// Now check: what divs are still open at depth 1 or less?
// Restart and print events where depth hits 1 or less in the middle
depth = 0;
let events = [];
for (let i = 902; i <= 2899; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  const opens = (line.match(/<div\b/g) || []).length;
  const selfClose = (line.match(/<div[^>]*\/>/g) || []).length;
  const realOpens = opens - selfClose;
  const closes = (line.match(/<\/div>/g) || []).length;
  const net = realOpens - closes;
  if (net !== 0) {
    depth += net;
    if (depth <= 2) {
      events.push({ lineNum, net, depth, preview: line.trim().substring(0, 80) });
    }
  }
}

console.log('\nEvents where depth <= 2 (showing JSX tree structure):');
events.slice(-30).forEach(e =>
  console.log('  L' + e.lineNum + ': net=' + (e.net>0?'+':'') + e.net + ', depth=' + e.depth + ' | ' + e.preview)
);
