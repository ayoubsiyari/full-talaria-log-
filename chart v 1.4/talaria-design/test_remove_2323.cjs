const fs = require('fs');
const { execSync } = require('child_process');
const lines = fs.readFileSync('src/TalariaV8b.jsx', 'utf8').split('\n');

// Check what line 2323 is
console.log('Line 2323:', JSON.stringify(lines[2322]));
console.log('Line 2322:', JSON.stringify(lines[2321]));
console.log('Line 2324:', JSON.stringify(lines[2323]));

// Remove line 2323 (index 2322)
const modified = [...lines.slice(0, 2322), ...lines.slice(2323)];
fs.writeFileSync('src/TalariaV8b.test2.jsx', modified.join('\n'));

try {
  execSync('node_modules\\.bin\\esbuild src/TalariaV8b.test2.jsx --bundle=false --jsx=automatic 2>&1', {
    stdio: 'pipe', encoding: 'utf8'
  });
  console.log('SUCCESS! No errors!');
} catch (e) {
  const output = (e.stdout || '') + (e.stderr || '');
  console.log('Still has errors:');
  console.log(output.split('\n').slice(0, 8).join('\n'));
}
