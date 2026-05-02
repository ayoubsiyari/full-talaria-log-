const fs = require('fs');
const { execSync } = require('child_process');

const lines = fs.readFileSync('src/TalariaV8b.jsx', 'utf8').split('\n');

function testWithReplacement(startLine, endLine) {
  // startLine and endLine are 1-indexed
  const before = lines.slice(0, startLine - 1);
  const after = lines.slice(endLine);
  // Replace section with a comment
  const replacement = [`        {/* REPLACED_${startLine}_TO_${endLine} */}`];
  const testContent = [...before, ...replacement, ...after].join('\n');
  fs.writeFileSync('src/TalariaV8b.bisect.jsx', testContent);

  try {
    execSync('node_modules\\.bin\\esbuild src/TalariaV8b.bisect.jsx --bundle=false --jsx=automatic', { stdio: 'pipe' });
    return { success: true, errorLine: null };
  } catch (e) {
    const output = e.stderr ? e.stderr.toString() : e.stdout ? e.stdout.toString() : '';
    const match = output.match(/TalariaV8b\.bisect\.jsx:(\d+):(\d+)/);
    if (match) {
      return { success: false, errorLine: parseInt(match[1]), errorCol: parseInt(match[2]), output: output.split('\n').slice(0,5).join('\n') };
    }
    return { success: false, errorLine: null, output: output.split('\n').slice(0,5).join('\n') };
  }
}

// Test: Replace lines 902-2325 with just a return statement
// (keeping the component structure)
console.log('Testing: Replace lines 1000-2325...');
const r1 = testWithReplacement(1000, 2325);
console.log('Result:', r1.success ? 'NO ERROR' : `ERROR at L${r1.errorLine}`);
if (!r1.success && r1.output) console.log(r1.output.split('\n').slice(0,3).join('\n'));

console.log('');
console.log('Testing: Replace lines 1500-2325...');
const r2 = testWithReplacement(1500, 2325);
console.log('Result:', r2.success ? 'NO ERROR' : `ERROR at L${r2.errorLine}`);
if (!r2.success && r2.output) console.log(r2.output.split('\n').slice(0,3).join('\n'));

console.log('');
console.log('Testing: Replace lines 2000-2325...');
const r3 = testWithReplacement(2000, 2325);
console.log('Result:', r3.success ? 'NO ERROR' : `ERROR at L${r3.errorLine}`);
if (!r3.success && r3.output) console.log(r3.output.split('\n').slice(0,3).join('\n'));

console.log('');
console.log('Testing: Replace lines 2100-2325...');
const r4 = testWithReplacement(2100, 2325);
console.log('Result:', r4.success ? 'NO ERROR' : `ERROR at L${r4.errorLine}`);
if (!r4.success && r4.output) console.log(r4.output.split('\n').slice(0,3).join('\n'));
