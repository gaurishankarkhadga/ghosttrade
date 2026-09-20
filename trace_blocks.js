const fs = require('fs');
const lines = fs.readFileSync('backend/geminiEngine.js', 'utf8').split('\n');
let blocks = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('try {')) blocks.push({type: 'try', line: i+1});
  if (line.includes('catch (')) {
    if (blocks.length > 0 && blocks[blocks.length-1].type === 'try') {
      blocks.pop();
    } else {
      console.log(`Orphan catch at line ${i+1}: ${line}`);
    }
  }
}
console.log('Unclosed blocks:', blocks);
