const fs = require('fs');
const lines = fs.readFileSync('src/TalariaV8b.jsx', 'utf8').split('\n');

// Count ALL divs from line 902 to end to find where root closes
// (looking for depth going from 1 to 0)
let depth = 0;
let events = [];

for (let i = 901; i < lines.length; i++) {
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
    // Check if depth hits 0 - that's where root div closes
    if (depth === 0) {
      console.log('Root div closes at line ' + lineNum + ': ' + line.trim().substring(0, 80));
      console.log('Previous few events:');
      events.slice(-5).forEach(e =>
        console.log('  L' + e.lineNum + ': net=' + (e.net>0?'+':'') + e.net + ', depth=' + e.depth)
      );
      break;
    }
    // Safety: stop if depth goes negative
    if (depth < 0) {
      console.log('ERROR: depth went negative at line ' + lineNum);
      break;
    }
  }
}

console.log('');
console.log('Final depth:', depth);
console.log('Total lines in file:', lines.length);
