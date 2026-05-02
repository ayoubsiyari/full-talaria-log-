const fs = require('fs');
const content = fs.readFileSync('src/TalariaV8b.jsx', 'utf8');

// Use esbuild directly to parse and find the actual error
const { execSync } = require('child_process');

// Strategy: binary search to find the FIRST line that causes the error
// by truncating the file at different points and seeing if error appears
const lines = content.split('\n');
const total = lines.length;

function testUpToLine(lineNum) {
  // Create a test file with lines 1..lineNum
  const testContent = lines.slice(0, lineNum).join('\n');
  fs.writeFileSync('src/TalariaV8b.bisect2.jsx', testContent);
  try {
    execSync('node_modules\\.bin\\esbuild src/TalariaV8b.bisect2.jsx --bundle=false --jsx=automatic 2>&1', {
      stdio: 'pipe',
      encoding: 'utf8'
    });
    return null; // no error
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '');
    const match = output.match(/bisect2\.jsx:(\d+):(\d+).*?Expected.*?"(.*?)"/);
    if (match) return { line: parseInt(match[1]), col: parseInt(match[2]), msg: match[0] };
    // Try alternate format
    const match2 = output.match(/ERROR: (.*)/);
    if (match2) return { line: -1, msg: match2[1] };
    return { line: -1, msg: output.split('\n')[0] };
  }
}

// Binary search: find the smallest prefix of the file that shows the error
let lo = 2800, hi = 3082;
let lastOkLine = 2800;
let firstErrorLine = 3082;

// First check: does truncating at 2800 still show the error?
console.log('Checking line 2800...');
const r2800 = testUpToLine(2800);
console.log('Result:', r2800 ? 'ERROR' : 'OK', r2800 ? r2800.msg : '');

console.log('Checking line 2900...');
const r2900 = testUpToLine(2900);
console.log('Result:', r2900 ? 'ERROR' : 'OK', r2900 ? r2900.msg : '');

console.log('Checking line 2950...');
const r2950 = testUpToLine(2950);
console.log('Result:', r2950 ? 'ERROR' : 'OK', r2950 ? r2950.msg : '');
