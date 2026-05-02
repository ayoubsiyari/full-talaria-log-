const fs = require('fs');
const content = fs.readFileSync('src/TalariaV8b.jsx', 'utf8');

// Try to find unclosed backtick template literals in the problem range
const lines = content.split('\n');

// Find the balance of backticks from line 902 onwards
// (checking for unterminated template literals)
let inTemplate = 0; // nesting level of template literals
let inTemplatePrev = 0;

// Actually, let's just search for lines with odd number of backticks (unmatched)
// that aren't part of template literal closures

// Simpler approach: find any backtick that creates a LONG template literal
// by finding ` that open but don't close on the same line (and aren't in strings)
let issues = [];

for (let i = 900; i < Math.min(2902, lines.length); i++) {
  const line = lines[i];
  const lineNum = i + 1;

  // Count backticks not preceded by $ (which would be ${...} inside template)
  // Very rough check: just count raw backticks
  const bticks = (line.match(/`/g) || []).length;
  if (bticks % 2 !== 0) {
    issues.push({ lineNum, bticks, preview: line.trim().substring(0, 80) });
  }
}

console.log('Lines with odd number of backticks (L901-L2902):');
issues.forEach(e => console.log('  L' + e.lineNum + ': ' + e.bticks + ' backtick(s) | ' + e.preview));
console.log('Total:', issues.length);
