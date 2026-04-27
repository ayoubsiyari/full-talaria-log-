const fs = require('fs');
const lines = fs.readFileSync('src/TalariaV8b.jsx', 'utf8').split('\n');

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
          result += 'X';
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

let parenDepth = 2; // Start at 2 (after news section)

// Track all events from 2666 to 2815
for (let i = 2665; i <= 2815; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  const stripped = stripStrings(line);

  const opens = (stripped.match(/\(/g) || []).length;
  const closes = (stripped.match(/\)/g) || []).length;
  const net = opens - closes;

  if (net !== 0) {
    parenDepth += net;
    console.log('  L' + lineNum + ': net=' + (net>0?'+':'') + net + ', paren=' + parenDepth + ' | ' + line.trim().substring(0, 70));
  }
}

console.log('Paren depth after line 2815:', parenDepth);
