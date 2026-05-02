const fs = require('fs');
const lines = fs.readFileSync('src/TalariaV8b.jsx', 'utf8').split('\n');

// Look for the actual JSX parse error by checking bracket/brace/paren balance
// but properly handling strings and template literals
// We'll track state machine style

let state = 'jsx'; // 'jsx' | 'js' | 'string_double' | 'string_single' | 'template' | 'comment_line' | 'comment_block'
let stateStack = [];
let depth = { paren: 0, brace: 0, angle: 0 };

// Simpler: just look for lines that have unbalanced braces/parens
// accounting for strings by stripping string content first

function stripStrings(line) {
  let result = '';
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      result += '"';
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\') i++;
        i++;
      }
      result += '"';
      i++;
    } else if (line[i] === "'") {
      result += "'";
      i++;
      while (i < line.length && line[i] !== "'") {
        if (line[i] === '\\') i++;
        i++;
      }
      result += "'";
      i++;
    } else if (line[i] === '`') {
      // Template literal - tricky because of ${...}
      result += '`';
      i++;
      let tlDepth = 0;
      while (i < line.length) {
        if (line[i] === '`' && tlDepth === 0) {
          result += '`';
          i++;
          break;
        }
        if (line[i] === '$' && line[i+1] === '{') {
          tlDepth++;
          result += '${';
          i += 2;
        } else if (line[i] === '}' && tlDepth > 0) {
          tlDepth--;
          result += '}';
          i++;
        } else if (tlDepth > 0) {
          result += line[i];
          i++;
        } else {
          result += 'X'; // replace template content
          i++;
        }
      }
    } else {
      result += line[i];
      i++;
    }
  }
  return result;
}

let parenDepth = 0;
let events = [];

for (let i = 2325; i <= 2910; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  const stripped = stripStrings(line);

  const opens = (stripped.match(/\(/g) || []).length;
  const closes = (stripped.match(/\)/g) || []).length;
  const net = opens - closes;

  if (net !== 0) {
    parenDepth += net;
    if (parenDepth <= 1 || events.length < 30 || i >= 2880) {
      events.push({ lineNum, net, parenDepth, preview: line.trim().substring(0, 70) });
    }
  }
}

console.log('Final paren depth:', parenDepth);
events.forEach(e =>
  console.log('  L' + e.lineNum + ': net=' + (e.net>0?'+':'') + e.net + ', paren=' + e.parenDepth + ' | ' + e.preview)
);
