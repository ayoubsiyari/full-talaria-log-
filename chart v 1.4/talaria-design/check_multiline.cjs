const fs = require('fs');
const content = fs.readFileSync('src/TalariaV8b.jsx', 'utf8');
const lines = content.split('\n');

// Find div openings that don't close on the same line
// and check if they close as self-closing on a subsequent line
let openStack = [];
let multiLineSelfClose = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;

  // Find div openings on this line that don't self-close
  const divOpens = [...line.matchAll(/<div\b/g)];
  const selfCloses = [...line.matchAll(/<div[^>]*\/>/g)];

  if (divOpens.length > selfCloses.length) {
    // There's a div open that doesn't self-close on this line
    // Check if the line ends with content suggesting the div continues to next line
    const trimmed = line.trim();
    if (trimmed.endsWith('{') || trimmed.endsWith(',') ||
        (!trimmed.includes('/>') && !trimmed.includes('</div>') &&
         divOpens.length > selfCloses.length)) {
      openStack.push({ lineNum, preview: line.trim().substring(0, 60) });
    }
  }

  // Check if a line ends a multi-line self-closing div (ends with />)
  // but doesn't open a new div
  if (line.trim().endsWith('/>') && !line.includes('<div')) {
    if (openStack.length > 0) {
      const opener = openStack[openStack.length - 1];
      multiLineSelfClose.push({
        openLine: opener.lineNum,
        closeLine: lineNum,
        preview: opener.preview
      });
      openStack.pop();
    }
  }
}

console.log('Potential multi-line self-closing divs in L2363-L2810:');
multiLineSelfClose
  .filter(m => m.openLine >= 2363 && m.openLine <= 2810)
  .forEach(m => console.log('  Open L' + m.openLine + ', Close L' + m.closeLine + ': ' + m.preview));
