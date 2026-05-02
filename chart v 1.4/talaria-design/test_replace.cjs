const fs = require('fs');
const lines = fs.readFileSync('src/TalariaV8b.jsx', 'utf8').split('\n');

// Replace lines 2326-2899 (1-indexed) with a minimal version
// That's indices 2325-2898 (0-indexed)
const before = lines.slice(0, 2325); // lines 1-2325
const after = lines.slice(2899); // lines 2900+

const minimal = [
  '        {rightPanel ? <div style={{width:280,height:"100%",background:"#0A0C14"}}>Right Panel</div> : orderPanelOpen ? <div style={{width:280,height:"100%",background:"#0A0C14"}}>Order Panel</div> : null}'
];

const result = [...before, ...minimal, ...after];
fs.writeFileSync('src/TalariaV8b.test.jsx', result.join('\n'));
console.log('Written test file. Original lines:', lines.length, 'New lines:', result.length);
