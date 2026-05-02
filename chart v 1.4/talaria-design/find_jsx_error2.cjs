const fs = require('fs');
const content = fs.readFileSync('src/TalariaV8b.jsx', 'utf8');
const { execSync } = require('child_process');
const lines = content.split('\n');

function testUpToLine(lineNum) {
  const testContent = lines.slice(0, lineNum).join('\n');
  fs.writeFileSync('src/TalariaV8b.bisect2.jsx', testContent);
  try {
    execSync('node_modules\\.bin\\esbuild src/TalariaV8b.bisect2.jsx --bundle=false --jsx=automatic 2>&1', {
      stdio: 'pipe', encoding: 'utf8'
    });
    return null;
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '');
    const firstLine = output.trim().split('\n')[0];
    // Find error type
    if (output.includes('Expected ")" but found "style"')) return 'TARGET_ERROR';
    if (output.includes('Unexpected end of file')) return 'EOF_ERROR: ' + firstLine;
    return 'OTHER: ' + firstLine;
  }
}

// Find the exact line where error transitions from EOF to the target error
for (let line = 2900; line <= 2960; line += 5) {
  const result = testUpToLine(line);
  console.log('Line ' + line + ': ' + result);
  if (result === 'TARGET_ERROR') {
    // Go back and find exact line
    console.log('\nNarrowing down...');
    for (let l = line - 4; l <= line; l++) {
      const r = testUpToLine(l);
      console.log('  Line ' + l + ': ' + r);
    }
    break;
  }
}
