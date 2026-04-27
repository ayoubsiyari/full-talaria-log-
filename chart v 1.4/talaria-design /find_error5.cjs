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

let parenDepth = 0;
let lastGoodLine = 0;

for (let i = 901; i <= 2325; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  const stripped = stripStrings(line);

  const opens = (stripped.match(/\(/g) || []).length;
  const closes = (stripped.match(/\)/g) || []).length;
  const net = opens - closes;

  if (net !== 0) {
    parenDepth += net;
    // Only print events that change depth significantly or are unexpected
    if (parenDepth <= 2) {
      console.log('  L' + lineNum + ': net=' + (net>0?'+':'') + net + ', paren=' + parenDepth + ' | ' + line.trim().substring(0, 70));
    }
  }
}

console.log('Paren depth from L902 to L2325:', parenDepth);
