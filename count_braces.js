const fs = require('fs');
const lines = fs.readFileSync('backend/geminiEngine.js', 'utf8').split('\n');
let count = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const open = (line.match(/\{/g) || []).length;
  const close = (line.match(/\}/g) || []).length;
  count += open - close;
  if (count < 0) {
    console.log(`Negative count at line ${i + 1}: ${line}`);
    break;
  }
}
console.log(`Final count: ${count}`);
