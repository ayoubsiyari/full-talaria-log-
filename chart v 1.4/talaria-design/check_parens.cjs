const fs = require('fs');
const lines = fs.readFileSync('src/TalariaV8b.jsx', 'utf8').split('\n');

// Count paren balance from line 2326 to 2901
let parenDepth = 0;
let events = [];

for (let i = 2325; i <= 2900; i++) {
  const line = lines[i];
  const lineNum = i + 1;

  // Simplified: count ( and ) not in obvious string contexts
  let cleaned = line
    .replace(/`[^`]*`/g, '``')
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''");

  const opens = (cleaned.match(/\(/g) || []).length;
  const closes = (cleaned.match(/\)/g) || []).length;

  const net = opens - closes;
  if (net !== 0) {
    parenDepth += net;
    events.push({ lineNum, net, parenDepth, preview: line.trim().substring(0, 70) });
  }
}

console.log('Final paren depth (should be 0):', parenDepth);
console.log('');
console.log('Last 20 events:');
events.slice(-20).forEach(e =>
  console.log('  L' + e.lineNum + ': net=' + (e.net>0?'+':'') + e.net + ', paren=' + e.parenDepth + ' | ' + e.preview)
);
console.log('');
console.log('First 20 events:');
events.slice(0, 20).forEach(e =>
  console.log('  L' + e.lineNum + ': net=' + (e.net>0?'+':'') + e.net + ', paren=' + e.parenDepth + ' | ' + e.preview)
);
